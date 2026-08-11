// Checks src/fem/fluxDiagnostics.js against two closed-form references before trusting it on
// a real solved equilibrium:
//
//   1. computeInternalInductance: for a flat (uniform) current density in a large-aspect-ratio
//      circular cross-section, Bp(rho) is exactly linear in minor radius, and the textbook
//      result is li = 0.5 (Wesson, "Tokamaks"; re-derivable directly: li = 2*integral(Bp(r)^2 *
//      r dr, 0, a) / (a^2 * Bp(a)^2) with Bp(r) = Bp(a)*(r/a) gives 1/2 exactly). A synthetic
//      psi = rho^2 field (rho = minor-radius distance from the magnetic axis) gives
//      grad(psi) proportional to rho, i.e. Bp proportional to rho -- exactly this profile.
//      Using a large major radius (R0 >> a) makes the mesh's real toroidal (Pappus-weighted)
//      volume average converge to the textbook's plain area-weighted average, which assumes a
//      straight cylinder. The "edge" value is averaged over the outermost ring of triangles,
//      whose centroids sit slightly inside the true boundary (rho ~ 1 - 1/(2*nRho)) -- an
//      O(1/nRho) discretization bias, not an aspect-ratio effect -- so this is checked as a
//      mesh-refinement convergence (same style as tools/validate_solovev.mjs), not a single
//      fixed-resolution tolerance.
//   2. computeBoundarySurfaceArea: a synthetic circular-cross-section torus boundary of major
//      radius R0 and minor radius a has exact analytic surface area 4*pi^2*R0*a -- same
//      "synthetic shape of known closed-form value" discipline as
//      tools/validate_stellarator_volume.mjs.
//
// Run with: node tools/validate_flux_diagnostics.mjs
import { buildOGridMesh } from "../src/geom/mesh.js";
import { computeInternalInductance, computeBoundarySurfaceArea } from "../src/fem/fluxDiagnostics.js";

let failures = 0;

// ---- 1. Internal inductance ----------------------------------------------------------
console.log("Internal inductance (li), flat-current-density circular cross-section:");
console.log("nRho  nTheta   li        relErr vs 0.5    ratio");

const liR0 = 200, liA = 1; // large aspect ratio, fixed -- isolates mesh-refinement convergence
const RES_CASES = [20, 40, 80, 160];
let prevErr = null;
let convergenceFailures = 0;
for (const nRho of RES_CASES) {
  const nTheta = nRho * 2;
  const mesh = buildOGridMesh({ R0: liR0, a: liA, kappa: 1, delta: 0 }, { nRho, nTheta });
  const psi = mesh.nodes.map(([R, Z]) => (R - liR0) * (R - liR0) + Z * Z); // psi = rho^2
  const li = computeInternalInductance(mesh, psi);
  const relErr = Math.abs(li - 0.5) / 0.5;
  const ratio = prevErr ? (prevErr / relErr).toFixed(2) : "-";
  if (prevErr && prevErr / relErr < 1.3) convergenceFailures++; // expect shrinking error, not a plateau
  console.log(`${String(nRho).padEnd(6)}${String(nTheta).padEnd(9)}${li.toFixed(5)}   ${(relErr * 100).toFixed(3)}%           ${ratio}`);
  prevErr = relErr;
}
if (convergenceFailures > 0 || prevErr > 0.01) {
  console.log(`FAIL: li did not converge cleanly to 0.5 with mesh refinement (final relErr=${(prevErr * 100).toFixed(3)}%)`);
  failures++;
} else {
  console.log("OK: converges to the textbook li=0.5 as mesh resolution increases.");
}

// ---- 2. Boundary surface area ----------------------------------------------------------
console.log("\nBoundary surface area, circular-cross-section torus (exact = 4*pi^2*R0*a):");
console.log("nTheta   computed      exact         relErr");

function circularBoundaryMesh(R0, a, nTheta) {
  const nodes = [];
  const boundaryNodes = [];
  for (let j = 0; j < nTheta; j++) {
    const theta = (2 * Math.PI * j) / nTheta;
    nodes.push([R0 + a * Math.cos(theta), a * Math.sin(theta)]);
    boundaryNodes.push(j);
  }
  return { nodes, triangles: [], boundaryNodes };
}

const R0 = 5.5, a = 0.5;
const exactS = 4 * Math.PI * Math.PI * R0 * a;
let prevSErr = null;
for (const nTheta of [16, 32, 64, 128, 256]) {
  const mesh = circularBoundaryMesh(R0, a, nTheta);
  const S = computeBoundarySurfaceArea(mesh);
  const relErr = Math.abs(S - exactS) / exactS;
  console.log(`${String(nTheta).padEnd(9)}${S.toFixed(5).padEnd(14)}${exactS.toFixed(5).padEnd(14)}${(relErr * 100).toFixed(4)}%`);
  prevSErr = relErr;
}
if (prevSErr > 0.001) {
  console.log(`FAIL: surface area did not converge to sub-0.1% at nTheta=256 (got relErr=${(prevSErr * 100).toFixed(4)}%)`);
  failures++;
} else {
  console.log("OK: converges to the exact torus surface area 4*pi^2*R0*a.");
}

console.log(failures === 0 ? "\nAll flux-diagnostics checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
