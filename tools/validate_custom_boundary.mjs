// Regression check for the generalized solveEquilibrium({R0, boundaryAt}, ...) path added for
// equation-based custom shapes (src/fem/equilibrium.js). Reruns the same Solov'ev
// convergence check as validate_solovev.mjs, but through solveEquilibrium's new
// boundaryAt-based branch instead of calling buildOGridMeshFromBoundary directly -- confirms
// the refactor didn't change behavior and that the new branch converges the same way the
// preset (Miller) branch already does.
// Run with: node tools/validate_custom_boundary.mjs
import { solveEquilibrium } from "../src/fem/equilibrium.js";
import { solovevSolution, solovevZeroContour } from "../src/fem/solovev.js";

const shape = { R0: 3.1, a: 1.0, kappa: 1.7, delta: 0.0 };
const A = 1.0;
const B = 0.5;

const psiExact = solovevSolution(shape, A, B);
const boundaryAt = solovevZeroContour(shape, A, B);

// A "profile" whose p'/FF' combination reproduces the constant Solov'ev source f = A*R + B/R
// (see src/fem/solovev.js's header comment for the derivation) -- same trick
// validate_solovev.mjs uses, just expressed as a profile object since solveEquilibrium takes
// one instead of a raw source function.
const profile = { p: () => A, FF: () => B };

function runAtResolution(nRho, nTheta) {
  const { mesh, psi } = solveEquilibrium(
    { R0: shape.R0, boundaryAt },
    profile,
    { nRho, nTheta },
    { tol: 1e-12, maxIter: 5 } // source is psi-independent (constant profile), converges in 1 step
  );

  let sumSq = 0;
  for (let i = 0; i < mesh.nodes.length; i++) {
    const [R, Z] = mesh.nodes[i];
    const err = psi[i] - psiExact(R, Z);
    sumSq += err * err;
  }
  const l2 = Math.sqrt(sumSq / mesh.nodes.length);
  return { l2, nNodes: mesh.nodes.length };
}

console.log("Custom-boundary path (solveEquilibrium generalization) vs. closed-form Solov'ev");
console.log("nRho  nTheta  nNodes   L2 error       ratio");

let prev = null;
let failures = 0;
for (const nRho of [8, 16, 32, 64]) {
  const nTheta = 6 * nRho;
  const { l2, nNodes } = runAtResolution(nRho, nTheta);
  const ratio = prev ? (prev / l2).toFixed(2) : "-";
  console.log(String(nRho).padEnd(6) + String(nTheta).padEnd(8) + String(nNodes).padEnd(9) + l2.toExponential(4).padEnd(15) + ratio);
  if (prev && prev / l2 < 3) failures++; // expect ~second-order convergence, ratio ~3.6-4x like validate_solovev.mjs
  prev = l2;
}

console.log(failures === 0 ? "\nConvergence looks second-order, matching validate_solovev.mjs -- refactor is safe." : "\nFAIL: convergence ratio lower than expected.");
process.exit(failures === 0 ? 0 : 1);
