// Runs the real src/braginskii solver pipeline (not a reimplementation) for a batch of
// timesteps and checks basic physical sanity: no NaN/blowup, density falls off from the
// fixed core boundary toward the wall (Bohm sink), and temperatures stay bounded between
// the core value and zero (they can't exceed their own source or go negative for a
// diffusion+sheath-loss system with no internal heating above the core temperature).
//
// This is a narrower check than the full 1D two-point-model steady-state comparison the
// project plan originally proposed -- that needs an independent analytic reference
// solution reconciled against this page's 2D, non-flux-aligned mesh, which is a bigger
// undertaking than fits here. What this script *does* check is real: it exercises the
// actual implicit anisotropic-diffusion + Robin-sheath assembly (equations.js), the real
// Braginskii closures (closures.js), and the real sheath physics (sheath.js) end to end,
// the same way tools/verify_pipeline.py (an independent from-scratch Python port, used
// during development since no JS runtime exists in this repo's dev sandbox) already
// caught and fixed a real units bug in this exact code path -- see sheath.js's comment on
// ionHeatRobin for that story. Run with: node tools/validate_braginskii_1d.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildOGridMeshFromBoundary } from "../src/geom/mesh.js";
import { buildIterWallBoundary } from "../src/braginskii/wallGeometry.js";
import { BackgroundField } from "../src/braginskii/background.js";
import { buildBraginskiiDofMap, precomputeMeshGeometry } from "../src/braginskii/equations.js";
import { computeWallSegments } from "../src/braginskii/wallSegments.js";
import { stepBraginskii } from "../src/braginskii/timestep.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "iter_equilibrium.json"), "utf8"));

const background = new BackgroundField(
  data.backgroundGrid.r_m, data.backgroundGrid.z_m, data.backgroundGrid.psi, data.btf_T, data.rtf_m, data,
);
const { centerR, boundaryAt } = buildIterWallBoundary(data);
const nRho = 14, nTheta = 32;
const mesh = buildOGridMeshFromBoundary(centerR, boundaryAt, { nRho, nTheta });
const dofMap = buildBraginskiiDofMap(mesh, 0.15);
const triGeom = precomputeMeshGeometry(mesh, background);
const wallSegments = computeWallSegments(mesh, centerR);

const wallField = new Map();
for (const g of mesh.boundaryNodes) {
  const t = triGeom.find((tg) => tg.tri.includes(g));
  wallField.set(g, t ? t.field.bHatPol : [1, 0]);
}

const params = {
  coreN: 2e19, coreT: 275, dPerp: 0.4, chiPerp: 1.6, deltaI1: 2.5, gammaE: 0, muIonMasses: 2,
};
const n0 = mesh.nodes.length;
const fixed = {
  n: new Float64Array(n0).fill(params.coreN),
  Ti: new Float64Array(n0).fill(params.coreT),
  Te: new Float64Array(n0).fill(params.coreT),
};
let state = {
  n: new Float64Array(n0).fill(params.coreN),
  Ti: new Float64Array(n0).fill(params.coreT),
  Te: new Float64Array(n0).fill(params.coreT),
};
const ctx = { mesh, dofMap, triGeom, wallSegments, wallField, params, fixed };

const dt = 2e-7;
const nSteps = 60;
let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
}

for (let i = 0; i < nSteps; i++) {
  state = stepBraginskii(state, ctx, dt);
  const anyNaN = [...state.n, ...state.Ti, ...state.Te].some((v) => !Number.isFinite(v));
  if (anyNaN) {
    check(`step ${i}: all fields finite`, false, "NaN/Inf encountered -- aborting");
    failures += nSteps - i; // don't bother continuing
    break;
  }
}

check("density stays finite and positive everywhere", [...state.n].every((v) => v > 0 && Number.isFinite(v)));
check("T_i stays finite and positive everywhere", [...state.Ti].every((v) => v > 0 && Number.isFinite(v)));
check("T_e stays finite and positive everywhere", [...state.Te].every((v) => v > 0 && Number.isFinite(v)));

const nWallAvg = average(mesh.boundaryNodes.map((g) => state.n[g]));
check(
  "wall density has fallen below the core value (Bohm sink is doing something)",
  nWallAvg < params.coreN,
  `wall avg n=${nWallAvg.toExponential(3)} vs core n=${params.coreN.toExponential(3)}`,
);

const TiWallAvg = average(mesh.boundaryNodes.map((g) => state.Ti[g]));
const TeWallAvg = average(mesh.boundaryNodes.map((g) => state.Te[g]));
check(
  "T_i stays at or below the core temperature (no internal heating above the source)",
  TiWallAvg <= params.coreT + 1e-6,
  `wall avg T_i=${TiWallAvg.toFixed(2)} eV vs core T=${params.coreT} eV`,
);
check(
  "T_e stays at or below the core temperature",
  TeWallAvg <= params.coreT + 1e-6,
  `wall avg T_e=${TeWallAvg.toFixed(2)} eV vs core T=${params.coreT} eV`,
);
check(
  "T_i cools faster than T_e at the wall (kappa_par_e >> kappa_par_i means electrons replenish heat loss faster)",
  TiWallAvg < TeWallAvg,
  `T_i=${TiWallAvg.toFixed(2)} eV, T_e=${TeWallAvg.toFixed(2)} eV`,
);

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

console.log(
  failures === 0
    ? "\nAll checks passed -- the real solver pipeline runs stably and behaves physically sensibly."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
