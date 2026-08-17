// Checks src/braginskii/closures.js against the NRL Plasma Formulary formulas it's
// supposed to implement, before anything downstream trusts them. Two kinds of check:
//   1. Independent re-derivation: the NRL prefactor formulas re-typed here from scratch
//      (not imported from closures.js) and compared against closures.js's own output --
//      catches transcription/unit-conversion bugs a self-consistency check alone can't.
//   2. Physical sanity: well-known Braginskii orderings (kappa_par_e >> kappa_par_i for
//      equal T, since electrons are much lighter and collide much less per unit time;
//      tau_e decreasing with density; Q_ei has the sign that drives T_e and T_i together).
// Run with: node tools/validate_braginskii_closures.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  coulombLogEI,
  tauE,
  tauI,
  kappaParE,
  kappaParI,
  etaParI,
  equilibrationQei,
  CONSTANTS,
} from "../src/braginskii/closures.js";

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
}

const { M_E_KG, EV_TO_J } = CONSTANTS;
const M_I_KG = 2 * CONSTANTS.M_P_KG; // deuterium

// --- 1. Independent re-derivation from the NRL Formulary's own printed formulas ---
function refTauE(n_m3, Te_eV, lnLambda) {
  const n_cm3 = n_m3 * 1e-6;
  return (3.44e5 * Te_eV ** 1.5) / (n_cm3 * lnLambda);
}
function refTauI(n_m3, Ti_eV, lnLambda, mu) {
  const n_cm3 = n_m3 * 1e-6;
  return (2.09e7 * Ti_eV ** 1.5 * Math.sqrt(mu)) / (n_cm3 * lnLambda);
}
function refKappaParE(n_m3, Te_eV, tau_e) {
  return (3.2 * n_m3 * (Te_eV * EV_TO_J) * tau_e) / M_E_KG;
}
function refKappaParI(n_m3, Ti_eV, tau_i, m_i) {
  return (3.9 * n_m3 * (Ti_eV * EV_TO_J) * tau_i) / m_i;
}
function refEtaParI(n_m3, Ti_eV, tau_i) {
  return 0.96 * n_m3 * (Ti_eV * EV_TO_J) * tau_i;
}
function refQei(n_m3, Te_eV, Ti_eV, tau_e, m_i) {
  return (3 * (M_E_KG / m_i) * n_m3 * ((Te_eV - Ti_eV) * EV_TO_J)) / tau_e;
}

const cases = [
  { n: 1e19, Te: 100, Ti: 100 }, // representative SOL/near-target conditions
  { n: 2e19, Te: 275, Ti: 275 }, // Dekeyser et al. 2021's actual AUG core-boundary values
  { n: 5e19, Te: 2000, Ti: 2000 }, // core-scale conditions
];

for (const { n, Te, Ti } of cases) {
  const lnL = coulombLogEI(n, Te);
  const refLnL = Te < 10 ? 23 - Math.log(Math.sqrt(n * 1e-6) * Ti ** -1.5) : 24 - Math.log(Math.sqrt(n * 1e-6) / Te);
  check(`lnLambda re-derivation matches, n=${n}, Te=${Te}`, Math.abs(lnL - refLnL) < 1e-9);

  const te = tauE(n, Te, lnL);
  const ti = tauI(n, Ti, lnL, 2);
  check(`tau_e matches NRL formula, n=${n}, Te=${Te}`, relClose(te, refTauE(n, Te, lnL)));
  check(`tau_i matches NRL formula, n=${n}, Ti=${Ti}`, relClose(ti, refTauI(n, Ti, lnL, 2)));

  const ke = kappaParE(n, Te, te);
  const ki = kappaParI(n, Ti, ti, M_I_KG);
  check(`kappa_par_e matches NRL formula`, relClose(ke, refKappaParE(n, Te, te)));
  check(`kappa_par_i matches NRL formula`, relClose(ki, refKappaParI(n, Ti, ti, M_I_KG)));

  const eta = etaParI(n, Ti, ti);
  check(`eta_par_i matches NRL formula`, relClose(eta, refEtaParI(n, Ti, ti)));

  const qei = equilibrationQei(n, Te, Ti, te, M_I_KG);
  check(`Q_ei matches NRL formula`, relClose(qei, refQei(n, Te, Ti, te, M_I_KG)));
}

function relClose(a, b, tol = 1e-9) {
  return Math.abs(a - b) / (Math.abs(b) || 1) < tol;
}

// --- 2. Physical sanity checks ---
{
  const n = 2e19, T = 275; // Dekeyser et al.'s own AUG core-boundary values
  const lnL = coulombLogEI(n, T);
  const te = tauE(n, T, lnL);
  const ti = tauI(n, T, lnL, 2);
  const ke = kappaParE(n, T, te);
  const ki = kappaParI(n, T, ti, M_I_KG);
  const ratio = ke / ki;
  // Textbook Braginskii result: kappa_par_e/kappa_par_i ~ sqrt(m_i/m_e) * (3.2/3.9) for
  // equal T_e=T_i -- electrons conduct heat parallel to B far faster than ions despite
  // colliding more often, because they're ~3670x (deuterium) lighter. Loose bound, not a
  // precise claim: this checks the well-known ordering, not a specific decimal.
  check(
    "kappa_par_e >> kappa_par_i at equal T (well-known Braginskii ordering)",
    ratio > 20 && ratio < 200,
    `ratio=${ratio.toFixed(1)}`,
  );

  const teHalfDensity = tauE(n / 2, T, lnL);
  check("tau_e decreases with density", teHalfDensity > te, `tau_e(n)=${te.toExponential(3)}, tau_e(n/2)=${teHalfDensity.toExponential(3)}`);

  const teHotter = tauE(n, T * 4, coulombLogEI(n, T * 4));
  check("tau_e increases with T_e (T_e^1.5 scaling)", teHotter > te, `tau_e(T)=${te.toExponential(3)}, tau_e(4T)=${teHotter.toExponential(3)}`);

  const qeiHotElectrons = equilibrationQei(n, T * 2, T, te, M_I_KG);
  const qeiHotIons = equilibrationQei(n, T, T * 2, te, M_I_KG);
  check("Q_ei > 0 (ions heat up) when T_e > T_i", qeiHotElectrons > 0);
  check("Q_ei < 0 (ions cool) when T_i > T_e", qeiHotIons < 0);

  // Order-of-magnitude sanity against the standard tokamak-core textbook ballpark
  // (tau_e ~ 1e-5 to 1e-2 s across T_e~10eV-10keV, n~1e18-1e20 m^-3) -- a loose bound, not
  // a specific quoted number, since this is a generic order-of-magnitude cross-check.
  check("tau_e lands in the standard tokamak-plasma ballpark", te > 1e-7 && te < 1e-1, `tau_e=${te.toExponential(3)} s`);
}

console.log(
  failures === 0
    ? "\nAll checks passed -- closures.js matches the NRL Formulary's own formulas and known orderings."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
