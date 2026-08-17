// FEM assembly for the Braginskii page's transport equations, reusing the same P1
// (linear-triangle) machinery src/fem/assemble.js already uses for the Grad-Shafranov
// stiffness matrix -- triGeometry's per-triangle {area, b, c} give the same shape-function
// gradient data, just used here for a different (anisotropic, time-dependent) bilinear
// form instead of the G-S equation's isotropic 1/R-weighted one.
//
// Domain split (see buildBraginskiiDofMap): a small inner disk (ring index <= coreRing) is
// held fixed at the core boundary values, standing in for the excluded hot core / pedestal
// top -- the same simplification real edge-transport codes make (they don't simulate the
// core either). Everything from coreRing out to the wall (including the wall ring itself)
// is solved; the wall ring additionally gets the sheath loss term from sheath.js folded
// into its row (a Robin/mixed boundary condition, not a fixed Dirichlet value -- the wall
// density/temperature are themselves part of the solve, responding to how fast the sheath
// carries particles/heat away).
//
// PHYSICAL CARE NOTE: parallel (kappa_par) and perpendicular (chi_perp) transport are
// combined into a single anisotropic diffusion tensor D = kappa_par*bhat*bhat^T +
// chi_perp*(I - bhat*bhat^T), and each triangle's constant P1 gradient is projected onto
// bhat/perp-to-bhat *before* multiplying by its own coefficient -- not applied as a scalar
// diffusivity along the mesh's own (arbitrary, not generally field-aligned) edges. Given
// kappa_par is typically many orders of magnitude larger than chi_perp, doing this
// naively (grid-edge-direction diffusivity) would leak enormous amounts of spurious
// cross-field transport through any small mesh/field misalignment -- exactly the
// numerical hazard Dekeyser et al. 2021 (Section 2) warn extended, non-flux-aligned grids
// are prone to. Projecting the true (R,Z) gradient vector onto the real field direction
// before applying each coefficient avoids that regardless of how well the mesh aligns
// with B.
import { COOMatrix } from "../math/sparse.js";
import { pcg } from "../math/cg.js";

export function buildBraginskiiDofMap(mesh, coreRingFrac = 0.15) {
  const n = mesh.nodes.length;
  const nRho = mesh.nRho;
  const ringOf = mesh.nodeRho.map((rho) => Math.round(rho * nRho));
  const coreRing = Math.max(1, Math.round(coreRingFrac * nRho));

  const isFixed = new Uint8Array(n);
  const isWall = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (ringOf[i] <= coreRing) isFixed[i] = 1;
  }
  for (const idx of mesh.boundaryNodes) isWall[idx] = 1;

  const globalToFree = new Int32Array(n).fill(-1);
  const freeToGlobal = [];
  for (let g = 0; g < n; g++) {
    if (!isFixed[g]) {
      globalToFree[g] = freeToGlobal.length;
      freeToGlobal.push(g);
    }
  }
  return { isFixed, isWall, ringOf, coreRing, globalToFree, freeToGlobal, nFree: freeToGlobal.length };
}

// Signed triangle gradient of the P1 shape functions: gradN[a] = (b[a], c[a]) / twoA
// (SIGNED twoA, not triGeometry's absolute-valued `area`, unlike assembleStiffness's use
// of it -- that function only ever needs symmetric squared products where the sign
// cancels; a true gradient VECTOR needs the sign kept, or the field direction it's about
// to be projected onto could come out flipped).
function signedTriGeometry(nodes, tri) {
  const [i, j, k] = tri;
  const [R1, Z1] = nodes[i];
  const [R2, Z2] = nodes[j];
  const [R3, Z3] = nodes[k];
  const twoA = (R2 - R1) * (Z3 - Z1) - (R3 - R1) * (Z2 - Z1);
  const b = [Z2 - Z3, Z3 - Z1, Z1 - Z2];
  const c = [R3 - R2, R1 - R3, R2 - R1];
  const gradN = [0, 1, 2].map((a) => [b[a] / twoA, c[a] / twoA]);
  return { twoA, area: Math.abs(twoA) / 2, gradN };
}

// Precomputes everything that doesn't change over the time-stepping loop: per-triangle
// geometry, centroid, and background field (the field is static -- see background.js).
export function precomputeMeshGeometry(mesh, background) {
  return mesh.triangles.map((tri) => {
    const { twoA, area, gradN } = signedTriGeometry(mesh.nodes, tri);
    const [R1, Z1] = mesh.nodes[tri[0]];
    const [R2, Z2] = mesh.nodes[tri[1]];
    const [R3, Z3] = mesh.nodes[tri[2]];
    const Rc = (R1 + R2 + R3) / 3;
    const Zc = (Z1 + Z2 + Z3) / 3;
    const field = background.fieldAt(Rc, Zc);
    return { tri, area, gradN, Rc, Zc, field };
  });
}

// Lumped mass vector (row-sum of the consistent P1 mass matrix, standard simplification
// that keeps the implicit system diagonal-plus-stiffness instead of needing a second
// sparse solve): M[node] += area/3 for every triangle containing it, times an optional
// per-node weight -- 1 for the continuity equation (state variable n itself), or 1.5*n
// for the energy equations (state variable T, but the time-derivative being discretized
// is d(3/2 n T)/dt; n is held fixed/lagged for this weight within a single implicit
// energy sub-step, the standard operator-splitting treatment -- see the module doc).
export function lumpedMass(mesh, triGeom, nodeWeight = () => 1) {
  const M = new Float64Array(mesh.nodes.length);
  for (const { tri, area } of triGeom) {
    for (const idx of tri) M[idx] += (area / 3) * nodeWeight(idx);
  }
  return M;
}

// Assembles the implicit backward-Euler system (M/dt + K) u_new = M/dt * u_old + rhs, for
// an anisotropic-diffusion + reaction equation. `coeffAt(triIdx)` returns {kappaPar,
// chiPerpN} for that triangle (chiPerpN already includes the n factor, i.e. this is
// chi_perp*n, matching the n*chi_perp*grad(T) form in the energy equations -- pass
// chiPerpN=D_perp and kappaPar=0 directly for the isotropic-only continuity equation).
// `reactionAt(nodeIdx)` returns a volumetric source/sink rate (already per-unit-time, not
// yet multiplied by area) added to the RHS, e.g. Q_ei. `wallRobin(nodeIdx)` returns
// {alpha, beta} for wall nodes (sheath loss: flux ~ alpha*u - beta, folded into the
// matrix diagonal and RHS at that node) or null for non-wall nodes.
export function assembleImplicitStep(mesh, dofMap, triGeom, mass, uOld, dt, coeffAt, reactionAt, wallRobin, fixedValues) {
  const { isFixed, globalToFree, nFree } = dofMap;
  const coo = new COOMatrix(nFree);
  const rhs = new Float64Array(nFree);

  // Mass/dt (lumped, diagonal) + reaction source, evaluated once per free node.
  for (let g = 0; g < mesh.nodes.length; g++) {
    const i = globalToFree[g];
    if (i < 0) continue;
    coo.add(i, i, mass[g] / dt);
    rhs[i] += (mass[g] / dt) * uOld[g] + mass[g] * reactionAt(g);
  }

  // Anisotropic stiffness, one triangle at a time.
  for (let t = 0; t < triGeom.length; t++) {
    const { tri, area, gradN, field } = triGeom[t];
    const { kappaPar, chiPerpN } = coeffAt(t);
    const [bR, bZ] = field.bHatPol;
    // D = kappaPar * bhat bhat^T + chiPerpN * (I - bhat bhat^T)
    for (let a = 0; a < 3; a++) {
      const ga = gradN[a];
      const gaPar = ga[0] * bR + ga[1] * bZ;
      const gaPerpR = ga[0] - gaPar * bR;
      const gaPerpZ = ga[1] - gaPar * bZ;
      for (let b = 0; b < 3; b++) {
        const gb = gradN[b];
        const gbPar = gb[0] * bR + gb[1] * bZ;
        const gbPerpR = gb[0] - gbPar * bR;
        const gbPerpZ = gb[1] - gbPar * bZ;
        const kij = area * (kappaPar * gaPar * gbPar + chiPerpN * (gaPerpR * gbPerpR + gaPerpZ * gbPerpZ));
        if (kij === 0) continue;

        const ga_g = tri[a], gb_g = tri[b];
        const ia = globalToFree[ga_g];
        const ib = globalToFree[gb_g];
        if (ia >= 0 && ib >= 0) {
          coo.add(ia, ib, kij);
        } else if (ia >= 0 && ib < 0) {
          // gb is a fixed (core) node -- move its known contribution to the RHS.
          rhs[ia] -= kij * fixedValues[gb_g];
        }
        // (ia < 0: row belongs to a fixed node, nothing to assemble)
      }
    }
  }

  // Wall sheath Robin term, added after the interior stiffness so it augments (not
  // replaces) whatever perpendicular/parallel diffusion already reaches the wall ring.
  for (let g = 0; g < mesh.nodes.length; g++) {
    const i = globalToFree[g];
    if (i < 0) continue;
    const robin = wallRobin(g);
    if (!robin) continue;
    coo.add(i, i, robin.alpha);
    rhs[i] += robin.beta;
  }

  return { A: coo.toCSR(), rhs };
}

export function solveImplicitStep(mesh, dofMap, triGeom, mass, uOld, dt, coeffAt, reactionAt, wallRobin, fixedValues) {
  const { A, rhs } = assembleImplicitStep(mesh, dofMap, triGeom, mass, uOld, dt, coeffAt, reactionAt, wallRobin, fixedValues);
  // Warm-start CG from uOld's own free-DOF values (previous timestep's solution) --
  // note this is uOld indexed *through the free-DOF remap*, not uOld's raw global-index
  // slice, which would silently warm-start each free DOF from the wrong node (the fixed
  // core nodes occupy the lowest global indices, so a raw slice doesn't line up with the
  // compacted free-DOF numbering globalToFree produces).
  const x0 = new Float64Array(dofMap.nFree);
  for (let g = 0; g < mesh.nodes.length; g++) {
    const i = dofMap.globalToFree[g];
    if (i >= 0) x0[i] = uOld[g];
  }
  const { x } = pcg(A, rhs, { x0, tol: 1e-8, maxIter: 2000 });
  const full = Float64Array.from(uOld);
  for (let g = 0; g < mesh.nodes.length; g++) {
    const i = dofMap.globalToFree[g];
    if (i >= 0) full[g] = x[i];
    else full[g] = fixedValues[g];
  }
  return { full, interior: x };
}
