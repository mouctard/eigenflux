// 0D plasma-diagnostics layer: normalized beta, thermal energy, safety factor, energy
// confinement scaling, L-H threshold, power balance, and a small set of clearly-illustrative
// divertor/edge estimates. See index.html's "Plasma diagnostics"/"Power balance"/"Divertor"
// how-it-works sections for the physics writeup and what's real vs. approximated vs.
// illustrative -- this file is organized in that same order.
const MU0 = 4 * Math.PI * 1e-7;
const KEV_JOULES = 1000 * 1.602176634e-19;

// Average ion mass (amu), for the IPB98(y,2) scaling law's M^0.19 term -- matches the
// isotope mix each fuel's reaction actually involves (src/fusion/fuels.js).
export const AVG_ION_MASS_AMU = { dt: 2.5, dd: 2.0, dHe3: 2.5 };

// ---- Real, derived from already-real inputs (T_keV/n0_m3 operating points, computed volume) ----

// W_th = (3/2)(n_e*T_e + n_i*T_i)*V, with n_e = n_i = n and T_e = T_i = T (the same
// quasi-neutral, single-temperature assumption the existing burn model already makes for its
// T/n operating points, src/fusion/presets.js) -> W_th = 3*n*T*V.
export function computeThermalEnergyJ(n_m3, T_keV, V_m3) {
  return 3 * n_m3 * T_keV * KEV_JOULES * V_m3;
}

export function computePressurePa(Wth_J, V_m3) {
  return V_m3 > 0 ? (2 / 3) * (Wth_J / V_m3) : 0;
}

// beta = p / (Bt^2 / 2*mu0); beta_N = beta[%] * a[m] * Bt[T] / Ip[MA] (Troyon normalization).
export function computeBetaN(pBar_Pa, Bt_T, a_m, Ip_MA) {
  if (!(Bt_T > 0) || !(Ip_MA > 0)) return 0;
  const beta = pBar_Pa / (Bt_T * Bt_T / (2 * MU0));
  return beta * 100 * a_m * Bt_T / Ip_MA;
}

// Poloidal field at the boundary from Ampere's law, treating the boundary as a circle of
// radius a: Bp(a) = mu0*Ip/(2*pi*a). This is the same large-aspect-ratio calibration
// computeQ95Approx and the divertor lambda_q estimate below both use to turn the new real
// Ip input into a real poloidal-field magnitude.
export function computeBpEdgeT(a_m, Ip_MA) {
  return a_m > 0 ? (MU0 * Ip_MA * 1e6) / (2 * Math.PI * a_m) : 0;
}

// q_95 via the standard large-aspect-ratio cylindrical safety factor q_cyl = a*Bt/(R0*Bp(a)),
// elongation-corrected by the common (1+kappa^2)/2 factor (Wesson, "Tokamaks"). This is an
// *approximation* -- not the exact flux-surface-averaged line integral q(psi) = (1/2pi)
// * oint (Bt*R)/(R*Bp) dl, which would need contour extraction at the 95%-flux surface
// (still future work, see "Not in this first pass").
export function computeQ95Approx(a_m, R0_m, kappa, Bt_T, Ip_MA) {
  if (!(Ip_MA > 0) || !(R0_m > 0)) return 0;
  const qCyl = (2 * Math.PI * a_m * a_m * Bt_T) / (MU0 * R0_m * Ip_MA * 1e6);
  return qCyl * (1 + kappa * kappa) / 2;
}

// IPB98(y,2) ELMy H-mode thermal energy confinement scaling (ITER Physics Basis / ITPA
// database) -- cross-checked this session against two independently-summarized sources with
// matching exponents:
//   tauE[s] = 0.0562 * Ip[MA]^0.93 * Bt[T]^0.15 * nbar[1e19 m^-3]^0.41 * P[MW]^-0.69
//             * R[m]^1.97 * kappa^0.78 * epsilon^0.58 * M[amu]^0.19
export function computeIPB98TauE({ Ip_MA, Bt_T, nebar_1e19, P_loss_MW, R0_m, kappa, epsilon, M_amu }) {
  if (!(P_loss_MW > 0) || !(Ip_MA > 0) || !(Bt_T > 0) || !(nebar_1e19 > 0)) return 0;
  return (
    0.0562 *
    Math.pow(Ip_MA, 0.93) *
    Math.pow(Bt_T, 0.15) *
    Math.pow(nebar_1e19, 0.41) *
    Math.pow(P_loss_MW, -0.69) *
    Math.pow(R0_m, 1.97) *
    Math.pow(kappa, 0.78) *
    Math.pow(epsilon, 0.58) *
    Math.pow(M_amu, 0.19)
  );
}

// Martin08 L-H transition power threshold scaling (n_e, Bt, plasma surface area S):
//   P_LH[MW] = 0.0488 * nbar[1e20 m^-3]^0.717 * Bt[T]^0.803 * S[m^2]^0.941 * (2/A_eff)
export function computeLHThreshold({ nebar_1e20, Bt_T, S_m2, A_eff }) {
  if (!(nebar_1e20 > 0) || !(Bt_T > 0) || !(S_m2 > 0) || !(A_eff > 0)) return 0;
  return 0.0488 * Math.pow(nebar_1e20, 0.717) * Math.pow(Bt_T, 0.803) * Math.pow(S_m2, 0.941) * (2 / A_eff);
}

// Standard 0D power balance: dW/dt = P_heat - P_rad - P_loss, i.e. P_loss = P_heat - P_rad -
// dW/dt. P_in/P_out are just the input/output totals for display -- P_out sums to exactly
// P_in by construction here (real balance equation), which is a *more* self-consistent
// balance than a hand-picked example shot's numbers would be, not a bug (see how-it-works).
export function computePowerBalance({ P_OH, P_NBI, P_ECH, P_ICH, P_alpha, P_rad, dWdt_MW }) {
  const P_heat_total = P_OH + P_NBI + P_ECH + P_ICH + P_alpha;
  const P_loss = P_heat_total - P_rad - dWdt_MW;
  return { P_heat_total, P_loss, P_in: P_heat_total, P_out: P_rad + P_loss + dWdt_MW };
}

// ---- Illustrative (not independently verified this session) -----------------------------
// Each function below is a simple, monotonic, physically-plausible-direction functional form,
// with its constant calibrated against one representative reference point rather than derived
// or checked against a source table -- the same epistemic tier the project already uses for
// the energy-capture blanket multiplier/efficiency numbers (src/fusion/capture.js). None of
// these feed the "real" quantities above.

// Eich et al. (2013 Nucl. Fusion, "Inter-ELM power decay length for JET and ASDEX Upgrade")
// regression-#14 scaling for the SOL power-decay width at the outer midplane:
//   lambda_q[mm] = 0.63 * Bpol,MP[T]^-1.19
// A real, published, widely-cited empirical scaling (not fitted here) -- Bp_T should be the
// poloidal field at the outer midplane, approximated here by the Ampere's-law edge value.
export function estimateLambdaQmm(Bp_T) {
  return 0.63 * Math.pow(Math.max(Bp_T, 1e-3), -1.19);
}

// Peak divertor heat flux, decomposed into real physical effects rather than one fitted
// constant: the parallel power channel of width lambda_q at the midplane (i) widens
// poloidally at the target by the poloidal flux expansion f_x = Bpol,midplane/Bpol,target
// (real tokamak divertor designs typically run f_x ~ 3-6), then (ii) that already-widened
// footprint is projected onto a target tilted at a shallow grazing/wetted incidence angle
// theta (real divertor target design values are typically ~2-3 degrees, precisely so this
// projection spreads an otherwise-unmanageable heat load over a larger physical area) --
// together these are why real divertor heat fluxes (single-to-low-double-digit MW/m^2) are so
// much lower than the bare P/(2*pi*R*lambda_q) midplane mapping would suggest. f_x and theta
// below are representative real tokamak/ITER-class divertor design values, not this specific
// (imaginary) device's own engineered numbers -- still real physics, just typical parameters.
const DIVERTOR_FLUX_EXPANSION = 4; // typical real poloidal flux expansion, f_x
const DIVERTOR_GRAZING_DEG = 2.5; // typical real target grazing/wetted incidence angle
const DIVERTOR_SPREAD_FACTOR = DIVERTOR_FLUX_EXPANSION / Math.sin((DIVERTOR_GRAZING_DEG * Math.PI) / 180);
export function estimateDivertorHeatFluxMWm2(P_loss_MW, R0_m, lambdaQ_mm) {
  const wettedArea = DIVERTOR_SPREAD_FACTOR * 2 * (2 * Math.PI * R0_m * (lambdaQ_mm / 1000));
  return wettedArea > 0 ? Math.max(0, P_loss_MW) / wettedArea : 0;
}

// Detachment fraction, as the real radiated-power fraction of total exhaust power --
// f_det = P_rad / (P_rad + P_loss). This is the standard real proxy for how far a divertor
// is toward detachment: as more of the exhaust power is radiated away (by seeded or intrinsic
// impurities) before ever reaching the target, less reaches it as conducted/convected heat,
// which is mechanistically most of what "detachment" protects the target from. It is a
// simplification of real 2-point-model SOL physics (which also tracks momentum/pressure loss
// and recombination along the flux tube, not modeled here) but uses only already-real,
// already-computed power-balance quantities -- no separate fitted constant.
export function estimateDetachmentFraction(P_rad_MW, P_loss_MW) {
  const total = Math.max(0, P_rad_MW) + Math.max(0, P_loss_MW);
  return total > 0 ? Math.max(0, Math.min(1, P_rad_MW / total)) : 0;
}

// Divertor surface temperature via real 1D transient conduction into a semi-infinite solid
// under constant surface heat flux q'' (a standard heat-transfer result, e.g. Incropera,
// "Fundamentals of Heat and Mass Transfer"): T_surface(t) - T_ambient = (2*q''/e)*sqrt(t/pi),
// where e = sqrt(k*rho*c) is the target material's thermal effusivity. Tungsten (the real
// material used in ITER-class divertor monoblocks) properties below are representative
// elevated-temperature values, not a specific alloy/grade's certified data. tPulse_s is the
// real elapsed time (not the sped-up fuel-burn clock) since this shot's magnets were first
// energized -- a genuinely real hardware timescale, so the target keeps heating up the longer
// a shot runs, exactly as a real divertor would (this does not model cooling between pulses).
const TUNGSTEN_K_WmK = 120; // thermal conductivity, W/(m*K)
const TUNGSTEN_RHO_KGM3 = 19300; // density, kg/m^3
const TUNGSTEN_C_JKGK = 134; // specific heat, J/(kg*K)
const TUNGSTEN_EFFUSIVITY = Math.sqrt(TUNGSTEN_K_WmK * TUNGSTEN_RHO_KGM3 * TUNGSTEN_C_JKGK);
const AMBIENT_C = 20;
export function estimateSurfaceTempC(qi_MWm2, tPulse_s) {
  const q_Wm2 = Math.max(0, qi_MWm2) * 1e6;
  const t = Math.max(0.001, tPulse_s);
  const riseC = ((2 * q_Wm2) / TUNGSTEN_EFFUSIVITY) * Math.sqrt(t / Math.PI);
  return AMBIENT_C + riseC;
}

// Illustrative radiated power: n^2*sqrt(T)-shaped (the qualitative Bremsstrahlung scaling),
// calibrated to the sample point (nbar~1.19e20, T~5.84 keV -> ~4.4 MW) since this session
// couldn't verify a trustworthy Bremsstrahlung coefficient/unit convention (see how-it-works).
export function estimateRadiatedPowerMW(nebar_1e20, T_keV) {
  return 1.2857 * nebar_1e20 * nebar_1e20 * Math.sqrt(Math.max(0, T_keV));
}

// Illustrative D-alpha base level (a.u.), linear in loss power -- calibrated so the sample
// point (P_loss~22.2MW) lands near 0.61 a.u. ELM-like spikes are layered on top of this base
// in the shot-trace animation (main.js), not modeled here.
export function estimateDAlphaBase(P_loss_MW) {
  return 0.0275 * Math.max(0, P_loss_MW);
}
