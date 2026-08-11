// Mesh-refinement convergence check against the closed-form Solov'ev equilibrium.
// Run with: node tools/validate_solovev.mjs
import { buildOGridMeshFromBoundary } from "../src/geom/mesh.js";
import { buildDofMap, assembleStiffness, assembleLoad, expandToFull } from "../src/fem/assemble.js";
import { pcg } from "../src/math/cg.js";
import { solovevSource, solovevSolution, solovevZeroContour } from "../src/fem/solovev.js";

// Up-down symmetric (delta = 0) test shape -- required by the closed-form derivation.
const shape = { R0: 3.1, a: 1.0, kappa: 1.7, delta: 0.0 };
const A = 1.0;
const B = 0.5;

const fSource = solovevSource(A, B);
const psiExact = solovevSolution(shape, A, B);
// Mesh against the solution's own zero-contour (only approximately the Miller ellipse --
// see solovevZeroContour's comment) so the discrete and analytic boundaries coincide
// exactly, isolating true FEM discretization error.
const boundaryAt = solovevZeroContour(shape, A, B);

function runAtResolution(nRho, nTheta) {
  const mesh = buildOGridMeshFromBoundary(shape.R0, boundaryAt, { nRho, nTheta });
  const dofMap = buildDofMap(mesh);
  const K = assembleStiffness(mesh, dofMap);
  const zeroPsi = new Float64Array(mesh.nodes.length);
  const F = assembleLoad(mesh, dofMap, zeroPsi, (R) => fSource(R));
  const { x: psiInterior, iterations } = pcg(K, F, { tol: 1e-12, maxIter: 5000 });
  const psiFull = expandToFull(mesh, dofMap, psiInterior);

  let sumSq = 0;
  for (let i = 0; i < mesh.nodes.length; i++) {
    const [R, Z] = mesh.nodes[i];
    const err = psiFull[i] - psiExact(R, Z);
    sumSq += err * err;
  }
  const l2 = Math.sqrt(sumSq / mesh.nodes.length);
  return { l2, nNodes: mesh.nodes.length, iterations };
}

console.log("Solov'ev fixed-boundary validation (up-down symmetric, kappa=1.7, delta=0)");
console.log("nRho  nTheta  nNodes   L2 error       CG iters   ratio");

let prev = null;
for (const nRho of [8, 16, 32, 64]) {
  const nTheta = 6 * nRho;
  const { l2, nNodes, iterations } = runAtResolution(nRho, nTheta);
  const ratio = prev ? (prev / l2).toFixed(2) : "-";
  console.log(
    String(nRho).padEnd(6) +
      String(nTheta).padEnd(8) +
      String(nNodes).padEnd(9) +
      l2.toExponential(4).padEnd(15) +
      String(iterations).padEnd(11) +
      ratio
  );
  prev = l2;
}
