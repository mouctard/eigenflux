// Checks src/fusion/diagnostics.js's real-physics formulas against independent references
// before trusting them in the UI:
//
//   1. W_th / pressure / beta_N: a hand-worked round-number test case (arithmetic carried out
//      by hand, not just re-deriving the code), catching unit-conversion or wiring mistakes.
//   2. IPB98(y,2) tau_E and Martin08 P_LH: independently re-transcribed straight from the cited
//      formulas (not copy-pasted from src/fusion/diagnostics.js), compared at several points --
//      an implementation-correctness check in the same spirit as the project's existing
//      before/after refactor diffs, catching typos/sign/argument-order/unit mistakes in the
//      shipped implementation.
//
// Run with: node tools/validate_diagnostics.mjs
import {
  computeThermalEnergyJ,
  computePressurePa,
  computeBetaN,
  computeIPB98TauE,
  computeLHThreshold,
} from "../src/fusion/diagnostics.js";

let failures = 0;
function check(label, actual, expected, tol) {
  const relErr = Math.abs(actual - expected) / Math.abs(expected);
  const ok = relErr < tol;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: got ${actual}, expected ${expected} (${(relErr * 100).toExponential(2)}% off)`);
  if (!ok) failures++;
}

// ---- 1. W_th / pressure / beta_N, hand-worked ------------------------------------------
// n_e=1e20 m^-3, T=10 keV, V=100 m^3, Bt=3T, a=1m, Ip=3MA.
// T_J = 10*1000*1.602176634e-19 = 1.602176634e-15 J
// Wth = 3 * 1e20 * 1.602176634e-15 * 100 = 4.806529902e7 J
// pBar = (2/3)*(Wth/V) = 3.204353268e5 Pa
// beta = pBar / (Bt^2/(2*mu0)), mu0 = 4*pi*1e-7 -> Bt^2/(2*mu0) = 9/2.5132741e-6 = 3.581271e6
// beta = 3.204353268e5 / 3.581271e6 = 0.0894772...  -> beta[%] = 8.94772
// beta_N = beta[%] * a * Bt / Ip = 8.94772 * 1 * 3 / 3 = 8.94772
const Wth = computeThermalEnergyJ(1e20, 10, 100);
check("W_th (n=1e20, T=10keV, V=100m^3)", Wth, 4.806529902e7, 1e-6);
const pBar = computePressurePa(Wth, 100);
check("pressure (from that W_th)", pBar, 3.204353268e5, 1e-6);
const betaN = computeBetaN(pBar, 3, 1, 3);
check("beta_N (Bt=3T, a=1m, Ip=3MA)", betaN, 8.94772, 2e-4);

// ---- 2. IPB98(y,2), independently re-transcribed ----------------------------------------
function referenceTauE({ Ip_MA, Bt_T, nebar_1e19, P_loss_MW, R0_m, kappa, epsilon, M_amu }) {
  return (
    0.0562 *
    Ip_MA ** 0.93 *
    Bt_T ** 0.15 *
    nebar_1e19 ** 0.41 *
    P_loss_MW ** -0.69 *
    R0_m ** 1.97 *
    kappa ** 0.78 *
    epsilon ** 0.58 *
    M_amu ** 0.19
  );
}
const tauECases = [
  { Ip_MA: 3.5, Bt_T: 3.11, nebar_1e19: 11.9, P_loss_MW: 22.2, R0_m: 2.96, kappa: 1.7, epsilon: 1.25 / 2.96, M_amu: 2.5 },
  { Ip_MA: 1.8, Bt_T: 2.1, nebar_1e19: 6.0, P_loss_MW: 15.0, R0_m: 1.66, kappa: 1.0, epsilon: 1.0 / 1.66, M_amu: 2.0 },
];
for (const c of tauECases) {
  check(`IPB98 tau_E (Ip=${c.Ip_MA}MA, Bt=${c.Bt_T}T)`, computeIPB98TauE(c), referenceTauE(c), 1e-9);
}

// ---- 3. Martin08 L-H threshold, independently re-transcribed ---------------------------
function referencePLH({ nebar_1e20, Bt_T, S_m2, A_eff }) {
  return 0.0488 * nebar_1e20 ** 0.717 * Bt_T ** 0.803 * S_m2 ** 0.941 * (2 / A_eff);
}
const pLHCases = [
  { nebar_1e20: 1.19, Bt_T: 3.11, S_m2: 90, A_eff: 2.5 },
  { nebar_1e20: 0.6, Bt_T: 2.1, S_m2: 40, A_eff: 2.0 },
];
for (const c of pLHCases) {
  check(`Martin08 P_LH (nbar=${c.nebar_1e20}e20, Bt=${c.Bt_T}T)`, computeLHThreshold(c), referencePLH(c), 1e-9);
}

console.log(failures === 0 ? "\nAll diagnostics checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
