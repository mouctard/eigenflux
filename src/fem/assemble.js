// P1 (linear) finite element assembly for the Grad-Shafranov weak form
//
//   integral( (1/R) grad(psi) . grad(v) )  =  integral( f(R, Z, psi) v )      psi = 0 on boundary
//
// Single-point (triangle centroid) quadrature is used throughout: exact for the constant
// gradients that P1 elements produce, and consistent between the stiffness and load terms.
import { COOMatrix } from "../math/sparse.js";

function triGeometry(nodes, tri) {
  const [i, j, k] = tri;
  const [R1, Z1] = nodes[i];
  const [R2, Z2] = nodes[j];
  const [R3, Z3] = nodes[k];
  const twoA = (R2 - R1) * (Z3 - Z1) - (R3 - R1) * (Z2 - Z1);
  const area = Math.abs(twoA) / 2;
  const b = [Z2 - Z3, Z3 - Z1, Z1 - Z2];
  const c = [R3 - R2, R1 - R3, R2 - R1];
  const Rc = (R1 + R2 + R3) / 3;
  const Zc = (Z1 + Z2 + Z3) / 3;
  return { area, b, c, Rc, Zc };
}

// Boundary nodes get psi = 0 exactly (Dirichlet), so only interior nodes are solved for.
export function buildDofMap(mesh) {
  const n = mesh.nodes.length;
  const isBoundary = new Uint8Array(n);
  for (const idx of mesh.boundaryNodes) isBoundary[idx] = 1;

  const globalToInterior = new Int32Array(n).fill(-1);
  const interiorToGlobal = [];
  for (let g = 0; g < n; g++) {
    if (!isBoundary[g]) {
      globalToInterior[g] = interiorToGlobal.length;
      interiorToGlobal.push(g);
    }
  }
  return { isBoundary, globalToInterior, interiorToGlobal, nInterior: interiorToGlobal.length };
}

export function assembleStiffness(mesh, dofMap) {
  const { globalToInterior, nInterior } = dofMap;
  const coo = new COOMatrix(nInterior);

  for (const tri of mesh.triangles) {
    const { area, b, c, Rc } = triGeometry(mesh.nodes, tri);
    if (area < 1e-14) continue;
    const weight = 1 / (4 * area * Rc);
    for (let a = 0; a < 3; a++) {
      const ia = globalToInterior[tri[a]];
      if (ia < 0) continue;
      for (let bIdx = 0; bIdx < 3; bIdx++) {
        const ib = globalToInterior[tri[bIdx]];
        if (ib < 0) continue;
        coo.add(ia, ib, weight * (b[a] * b[bIdx] + c[a] * c[bIdx]));
      }
    }
  }
  return coo.toCSR();
}

// f(Rc, Zc, psiAtCentroid) -> source value. psiFull supplies nodal psi (all zero on the
// first call of a Picard iteration, updated thereafter) so f can depend on psi.
export function assembleLoad(mesh, dofMap, psiFull, fFunc) {
  const { globalToInterior, nInterior } = dofMap;
  const F = new Float64Array(nInterior);

  for (const tri of mesh.triangles) {
    const { area, Rc, Zc } = triGeometry(mesh.nodes, tri);
    if (area < 1e-14) continue;
    const psiC = (psiFull[tri[0]] + psiFull[tri[1]] + psiFull[tri[2]]) / 3;
    const contribution = (fFunc(Rc, Zc, psiC) * area) / 3;
    for (let a = 0; a < 3; a++) {
      const ia = globalToInterior[tri[a]];
      if (ia < 0) continue;
      F[ia] += contribution;
    }
  }
  return F;
}

export function expandToFull(mesh, dofMap, psiInterior) {
  const full = new Float64Array(mesh.nodes.length); // boundary nodes stay 0 (Dirichlet)
  const { interiorToGlobal } = dofMap;
  for (let i = 0; i < interiorToGlobal.length; i++) {
    full[interiorToGlobal[i]] = psiInterior[i];
  }
  return full;
}
