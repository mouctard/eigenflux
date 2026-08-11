// Checks computeSurfaceVolume against a synthetic circular torus of known volume
// (2*pi^2*R0*a^2), built with the exact same nTheta x nZeta zeta-major/theta-minor grid
// format as the real exported stellarator data, before trusting it on real DESC surfaces.
// A structured-grid mesh volume is only exact in the continuum limit, so this checks
// convergence (error shrinking as resolution increases) rather than a single fixed
// tolerance -- same style as tools/validate_solovev.mjs's mesh-refinement check.
// Run with: node tools/validate_stellarator_volume.mjs
import { computeSurfaceVolume } from "../src/stellarator/volume.js";

function buildTorus(R0, a, nTheta, nZeta) {
  const n = nTheta * nZeta;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let j = 0; j < nZeta; j++) {
    const zeta = (2 * Math.PI * j) / nZeta;
    for (let i = 0; i < nTheta; i++) {
      const theta = (2 * Math.PI * i) / nTheta;
      const r = R0 + a * Math.cos(theta);
      const k = j * nTheta + i;
      X[k] = r * Math.cos(zeta);
      Y[k] = r * Math.sin(zeta);
      Z[k] = a * Math.sin(theta);
    }
  }
  return { X, Y, Z };
}

const R0 = 5.5, a = 0.5; // roughly W7-X scale
const exact = 2 * Math.PI * Math.PI * R0 * a * a;

console.log(`Synthetic torus, R0=${R0} a=${a}, exact volume=${exact.toFixed(5)} m^3`);
console.log("nTheta  nZeta   computed     relErr    ratio");

let prevErr = null;
let failures = 0;
for (const n of [16, 24, 32, 48, 64, 96]) {
  const nZeta = n * 2;
  const surface = buildTorus(R0, a, n, nZeta);
  const computed = computeSurfaceVolume(surface, n, nZeta);
  const relErr = Math.abs(computed - exact) / exact;
  const ratio = prevErr ? (prevErr / relErr).toFixed(2) : "-";
  if (prevErr && prevErr / relErr < 1.3) failures++; // expect clean convergence, not a plateau
  console.log(`${String(n).padEnd(8)}${String(nZeta).padEnd(8)}${computed.toFixed(5).padEnd(13)}${(relErr * 100).toFixed(4)}%    ${ratio}`);
  prevErr = relErr;
}

// The real exported data (tools/export_stellarators.py) uses nTheta=32, nZeta=96 -- confirm
// that resolution alone gives sub-1% error, the precision level actually shipped.
const shipped = computeSurfaceVolume(buildTorus(R0, a, 32, 96), 32, 96);
const shippedErr = Math.abs(shipped - exact) / exact;
console.log(`\nAt the shipped export resolution (nTheta=32, nZeta=96): relErr=${(shippedErr * 100).toFixed(4)}%`);
if (shippedErr > 0.01) failures++;

console.log(failures === 0 ? "\nConverges cleanly; shipped resolution is sub-1% accurate." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
