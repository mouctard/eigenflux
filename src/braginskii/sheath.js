// Generalized sheath boundary conditions, Dekeyser et al. 2021 (Nuclear Materials and
// Energy 27, 100999) eq. 7/9/10/11, in the no-drift/no-current limit this page uses (the
// potential/current equation isn't solved here -- see equations.js's module doc and the
// page's "How this works" panel; the reference paper's own AUG demonstration run in its
// Section 6 also runs without it: "The potential equation is not solved (and hence drifts
// and currents are not included)"). The key generalization this page actually needs from
// that paper is still real: the flux at each wall face is projected by the *local*
// field-incidence angle |bhat.nu_hat|, not assumed-normal incidence -- because this page's
// wall is a real, non-flux-surface shape (src/braginskii/wallGeometry.js), incidence angle
// genuinely varies from node to node around it, unlike a flux-surface-terminated grid
// where it's ~constant by construction.
//
// delta_i1 = 2.5 is the literal value Dekeyser et al. used in their real AUG 16151 run
// (Section 6: "an ion parallel sheath transmission coefficient of delta_i,1 = 2.5"), used
// here as this page's default too. delta_e = (1+gamma_e)/(1-gamma_e) is exactly the
// reference paper's own eq. 11 reduced to the no-current/no-potential limit this page
// uses (drop e*phi and j_par there); gamma_e (secondary electron emission coefficient,
// Stangeby "The Plasma Boundary of Magnetic Fusion Devices" gives its typical range as
// ~0-0.5) is a UI-adjustable parameter, giving delta_e from 1 (gamma_e=0) to 3
// (gamma_e=0.5) -- this thermal-conduction term alone, not the larger ~2-5 "total sheath
// heat transmission coefficient" figures often quoted, which bundle in the electrons' own
// convected kinetic energy flux as a separate term this page doesn't add.
const M_P_KG = 1.67262e-27;
const EV_TO_J = 1.602176634e-19;

export function soundSpeed(T_e_eV, T_i_eV, muIonMasses = 2) {
  const m_i = muIonMasses * M_P_KG;
  return Math.sqrt(((T_e_eV + T_i_eV) * EV_TO_J) / m_i);
}

// Wall-normal unit vector at a boundary node, estimated from the two adjacent wall-ring
// edges (outward, i.e. pointing away from the mesh center). `prevXY`/`nextXY` are the
// neighboring boundary-ring node coordinates (cyclic).
export function outwardNormal(centerR, R, Z, prevXY, nextXY) {
  const tx = nextXY[0] - prevXY[0];
  const ty = nextXY[1] - prevXY[1];
  // rotate tangent by -90deg to get a normal candidate, then orient outward (away from
  // the mesh center, which is always interior by construction -- see wallGeometry.js).
  let nx = ty, ny = -tx;
  const norm = Math.hypot(nx, ny) || 1;
  nx /= norm; ny /= norm;
  const toCenterX = centerR - R, toCenterY = 0 - Z;
  if (nx * toCenterX + ny * toCenterY > 0) { nx = -nx; ny = -ny; } // flip if it points inward
  return [nx, ny];
}

// Per-wall-node Robin coefficients for the continuity equation: Gamma.nu = |bhat.nu| n
// c_s (paper eq. 9, anomalous-leakage term dropped -- this page's whole domain terminates
// at the real wall, so there's no outer open flux surface for that term to apply to).
// Loss is linear in n, so it's a pure alpha term (beta=0): d(mass*n)/dt gets a
// -alpha*n loss, alpha = |bhat.nu| c_s * nodeHalfLength.
export function densityRobin(bHatPol, normal, cs, nodeHalfLength) {
  const incidence = Math.abs(bHatPol[0] * normal[0] + bHatPol[1] * normal[1]);
  return { alpha: incidence * cs * nodeHalfLength, beta: 0 };
}

// Ion heat-flux Robin term (paper eq. 10, no anomalous-leakage term, same reasoning as
// above): Q_i.nu = delta_i1 |bhat.nu| n c_s T_i. This is loss proportional to n*T_i, i.e.
// nonlinear in the state -- linearized (like every coefficient in this solve) about the
// current/lagged n, so it enters as a linear-in-T_i alpha term using the lagged n.
//
// UNIT NOTE: this returns alpha already scaled for the "1.5*n * dT_eV/dt = ..." energy
// equation equations.js/timestep.js actually solve (T in eV, mass matrix = 1.5*n, no
// Joule conversion) -- NOT the raw physical Watts/m alpha. The physical sheath heat flux
// is Q_i.nu = delta_i1 |bhat.nu| n c_s T_i (Joules, T_i in Joules = T_i_eV*EV_TO_J); the
// governing equation is (3/2 n)(EV_TO_J) dT_eV/dt = ... + Q_i.nu-like loss terms, and
// dividing the whole equation by EV_TO_J (to make T_eV, not T_eV*EV_TO_J, the natural
// unknown) cancels the EV_TO_J the physical flux would otherwise carry -- leaving this
// alpha with NO explicit EV_TO_J factor. Getting this cancellation backwards (e.g.
// dividing by an extra, unwarranted EV_TO_J or 1.5*n) silently makes sheath losses ~1e19x
// too weak to do anything -- exactly the bug tools/verify_pipeline.py (a from-scratch
// Python re-port used to check this file numerically, since no JS runtime exists in the
// dev sandbox this was built in) caught before this comment existed: temperatures stayed
// frozen at their initial value for 20 real timesteps with the naive (wrong) scaling.
export function ionHeatRobin(bHatPol, normal, cs, n_lagged, deltaI1, nodeHalfLength) {
  const incidence = Math.abs(bHatPol[0] * normal[0] + bHatPol[1] * normal[1]);
  return { alpha: deltaI1 * incidence * cs * n_lagged * nodeHalfLength, beta: 0 };
}

// Electron heat-flux Robin term (paper eq. 11, no-current/no-potential limit):
// Q_e.nu = delta_e |bhat.nu| n c_s T_e. Same "already eV-equation-scaled, no EV_TO_J"
// convention as ionHeatRobin above.
export function electronHeatRobin(bHatPol, normal, cs, n_lagged, deltaE, nodeHalfLength) {
  const incidence = Math.abs(bHatPol[0] * normal[0] + bHatPol[1] * normal[1]);
  return { alpha: deltaE * incidence * cs * n_lagged * nodeHalfLength, beta: 0 };
}

export function electronDelta(gammaE) {
  return (1 + gammaE) / (1 - gammaE);
}
