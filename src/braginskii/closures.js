// Real Braginskii parallel-transport closures, taken directly from the NRL Plasma
// Formulary (2019 revision, A.S. Richardson ed.), "Transport Coefficients" section
// (p.36), itself citing S.I. Braginskii, "Transport Processes in a Plasma," Reviews of
// Plasma Physics Vol. 1 (1965) -- verified against the formulary's actual PDF text before
// being typed in here (not transcribed from memory), because these numeric prefactors are
// exactly the kind of thing that's easy to get subtly wrong (3.16 vs 3.2, missing a unit
// conversion, etc).
//
// IMPORTANT UNIT NOTE: the formulary's own numeric-prefactor formulas (3.44e5, 2.09e7
// below) are in Gaussian cgs practical units -- density in cm^-3, temperature in eV, ion
// mass in proton masses (formulary p.30: "All quantities are in Gaussian cgs units except
// temperature ... expressed in eV and ion mass ... in units of the proton mass"). The rest
// of this codebase uses SI (n in m^-3, e.g. src/fusion/diagnostics.js's IPB98 formulas),
// so every function here takes n in m^-3 and converts to cm^-3 internally, right where the
// NRL formula is applied -- see the `n_cm3` local in each function below.

const M_E_KG = 9.10938e-31;
const M_P_KG = 1.67262e-27;
const EV_TO_J = 1.602176634e-19;

// Electron-ion Coulomb logarithm, NRL Formulary "Coulomb Logarithm" (b), the two branches
// relevant to SOL/divertor conditions (T_i*m_e/m_i is negligible here, so only the
// T_e-vs-10*Z^2 eV split matters). n_e in m^-3, T_e in eV, Z=1 (hydrogenic).
export function coulombLogEI(n_e_m3, T_e_eV, Z = 1) {
  const n_cm3 = n_e_m3 * 1e-6;
  if (T_e_eV < 10 * Z * Z) {
    return 23 - Math.log(Math.sqrt(n_cm3) * Z * Math.pow(T_e_eV, -1.5));
  }
  return 24 - Math.log(Math.sqrt(n_cm3) / T_e_eV);
}

// Electron collision time (NRL Formulary p.36): tau_e = 3.44e5 * T_e_eV^1.5 / (n_cm3 *
// lnLambda) seconds. n in m^-3 here; converted to cm^-3 for the formula itself.
export function tauE(n_m3, T_e_eV, lnLambda) {
  const n_cm3 = n_m3 * 1e-6;
  return (3.44e5 * Math.pow(T_e_eV, 1.5)) / (n_cm3 * lnLambda);
}

// Ion collision time (NRL Formulary p.36): tau_i = 2.09e7 * T_i_eV^1.5 * sqrt(mu) /
// (n_cm3 * lnLambda) seconds, mu = ion mass in proton masses.
export function tauI(n_m3, T_i_eV, lnLambda, muIonMasses = 2) {
  const n_cm3 = n_m3 * 1e-6;
  return (2.09e7 * Math.pow(T_i_eV, 1.5) * Math.sqrt(muIonMasses)) / (n_cm3 * lnLambda);
}

// Parallel electron thermal conductivity, kappa_par_e = 3.2 * n*k*T_e*tau_e / m_e
// (NRL Formulary p.36: "electron thermal conductivities kappa_par^e = 3.2 n k T_e tau_e /
// m_e"). Returns SI W/(m*K)-equivalent (n in m^-3, T_e_eV converted to Joules via k*T).
export function kappaParE(n_m3, T_e_eV, tau_e_s) {
  return (3.2 * n_m3 * (T_e_eV * EV_TO_J) * tau_e_s) / M_E_KG;
}

// Parallel ion thermal conductivity, kappa_par_i = 3.9 * n*k*T_i*tau_i / m_i.
export function kappaParI(n_m3, T_i_eV, tau_i_s, m_i_kg) {
  return (3.9 * n_m3 * (T_i_eV * EV_TO_J) * tau_i_s) / m_i_kg;
}

// Parallel ion viscosity, eta_0i = 0.96 * n*k*T_i*tau_i.
export function etaParI(n_m3, T_i_eV, tau_i_s) {
  return 0.96 * n_m3 * (T_i_eV * EV_TO_J) * tau_i_s;
}

// Electron-ion energy equilibration: Q_i = 3*(m_e/m_i)*n*k*(T_e-T_i)/tau_e (rate ion
// internal energy density gains from electrons; electrons lose the same, Q_e=-Q_i-R.u,
// the R.u frictional term dropped here since no parallel current is solved -- see
// src/braginskii's "How this works" panel for that scope note). Returns W/m^3.
export function equilibrationQei(n_m3, T_e_eV, T_i_eV, tau_e_s, m_i_kg) {
  return (3 * (M_E_KG / m_i_kg) * n_m3 * ((T_e_eV - T_i_eV) * EV_TO_J)) / tau_e_s;
}

export const CONSTANTS = { M_E_KG, M_P_KG, EV_TO_J };
