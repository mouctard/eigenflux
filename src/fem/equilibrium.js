// Picard (fixed-point) iteration driver for the nonlinear Grad-Shafranov equilibrium.
//
// The stiffness matrix K depends only on mesh geometry (the 1/R weight), not on psi, so
// it is assembled once and reused for every iteration -- only the load vector changes.
// Each iteration is therefore a single (warm-started) linear solve, not a refactorization.
import { buildOGridMesh } from "../geom/mesh.js";
import { buildDofMap, assembleStiffness, assembleLoad, expandToFull } from "./assemble.js";
import { pcg } from "../math/cg.js";

export function solveEquilibrium(shape, profile, meshOpts = {}, opts = {}) {
  const { nRho = 26, nTheta = 48 } = meshOpts;
  const { tol = 1e-6, maxIter = 60 } = opts;

  const mesh = buildOGridMesh(shape, { nRho, nTheta });
  const dofMap = buildDofMap(mesh);
  const K = assembleStiffness(mesh, dofMap);

  let psiFull = new Float64Array(mesh.nodes.length);
  let psiInterior;

  // Initial guess: a flat unit source gives a smooth, positive, axis-peaked starting
  // field, avoiding the trivial all-zero fixed point an all-zero initial guess would sit at.
  {
    const F = assembleLoad(mesh, dofMap, psiFull, () => 1);
    const { x } = pcg(K, F, { tol: 1e-10, maxIter: 2000 });
    psiInterior = x;
    psiFull = expandToFull(mesh, dofMap, psiInterior);
  }

  const sourceAt = (R, Z, psiAtPoint, psiAxis) => {
    const psiN = psiAxis > 0 ? 1 - psiAtPoint / psiAxis : 0;
    const clamped = Math.max(0, Math.min(1, psiN));
    return R * profile.p(clamped) + profile.FF(clamped) / R;
  };

  let iterations = 0;
  let residual = Infinity;

  for (; iterations < maxIter; iterations++) {
    const psiAxis = maxOf(psiFull);
    const F = assembleLoad(mesh, dofMap, psiFull, (R, Z, psiC) => sourceAt(R, Z, psiC, psiAxis));
    const { x: newInterior } = pcg(K, F, { x0: psiInterior, tol: 1e-9, maxIter: 2000 });
    const newFull = expandToFull(mesh, dofMap, newInterior);

    residual = relChange(newFull, psiFull);
    psiInterior = newInterior;
    psiFull = newFull;

    if (residual < tol) {
      iterations++;
      break;
    }
  }

  return { mesh, dofMap, psi: psiFull, psiAxis: maxOf(psiFull), iterations, residual };
}

function maxOf(arr) {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

function relChange(a, b) {
  let num = 0, den = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    num += d * d;
    den += a[i] * a[i];
  }
  return Math.sqrt(num) / (Math.sqrt(den) || 1);
}
