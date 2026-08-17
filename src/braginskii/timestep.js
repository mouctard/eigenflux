// Orchestrates one implicit timestep: continuity (n), then ion energy (T_i), then
// electron energy (T_e), each an implicit anisotropic-diffusion + Robin-sheath solve
// (equations.js), sequentially operator-split -- n is updated first and then held fixed
// (lagged) as the background density for the T_i/T_e sub-steps, and all nonlinear
// Braginskii coefficients (kappa_par, tau_e, tau_i, Coulomb log) are evaluated from the
// *previous* step's temperatures (semi-implicit/lagged-coefficient treatment), the same
// pragmatic linearization src/fem/equilibrium.js's Picard loop already uses for the
// Grad-Shafranov equation's nonlinear source term, just applied once per timestep here
// instead of iterated to convergence -- appropriate because the implicit diffusion solve
// itself is what's needed for numerical stability against the stiff kappa_par term, not
// because the equations are only mildly nonlinear.
import {
  coulombLogEI, tauE, tauI, kappaParE, kappaParI, equilibrationQei, CONSTANTS,
} from "./closures.js";
import { soundSpeed, densityRobin, ionHeatRobin, electronHeatRobin, electronDelta } from "./sheath.js";
import { lumpedMass, solveImplicitStep } from "./equations.js";

const { M_P_KG, EV_TO_J } = CONSTANTS;

function triAvg(state, tri) {
  return (state[tri[0]] + state[tri[1]] + state[tri[2]]) / 3;
}

export function stepBraginskii(state, ctx, dt) {
  const { mesh, dofMap, triGeom, wallSegments, params, fixed } = ctx;
  const { n, Ti, Te } = state;
  const mI = params.muIonMasses * M_P_KG;

  // --- 1. Continuity: isotropic perpendicular diffusion + Bohm particle-flux sheath BC ---
  const massN = lumpedMass(mesh, triGeom); // weight=1
  const coeffN = () => ({ kappaPar: 0, chiPerpN: params.dPerp });
  const reactionN = () => 0; // no volumetric particle source in this scope -- see plan
  const wallRobinN = (g) => {
    const seg = wallSegments.get(g);
    if (!seg) return null;
    const cs = soundSpeed(Te[g], Ti[g], params.muIonMasses);
    const bHat = ctx.wallField.get(g) || [1, 0];
    return densityRobin(bHat, seg.normal, cs, seg.halfLength);
  };
  const { full: nNew } = solveImplicitStep(mesh, dofMap, triGeom, massN, n, dt, coeffN, reactionN, wallRobinN, fixed.n);

  // --- 2. Ion energy: real Braginskii kappa_par_i + anomalous chi_perp_i + Q_ei + sheath ---
  const massTi = lumpedMass(mesh, triGeom, (g) => 1.5 * nNew[g]);
  const coeffTi = (t) => {
    const { tri } = triGeom[t];
    const nAvg = triAvg(nNew, tri), TiAvg = triAvg(Ti, tri), TeAvg = triAvg(Te, tri);
    const lnL = coulombLogEI(nAvg, TeAvg);
    const tau_i = tauI(nAvg, TiAvg, lnL, params.muIonMasses);
    return { kappaPar: kappaParI(nAvg, TiAvg, tau_i, mI), chiPerpN: params.chiPerp * nAvg };
  };
  // reactionAt must return a rate for the "1.5*n * dT_eV/dt = ..." equation actually being
  // solved (T in eV, mass=1.5*n with no Joule conversion -- see equations.js's module doc
  // and the unit note on sheath.js's ionHeatRobin); equilibrationQei returns a physical
  // Watts/m^3-scale rate (it deliberately keeps the real EV_TO_J Joule conversion, since
  // it's cited straight from the NRL Formulary in true SI units), so it needs dividing by
  // EV_TO_J here to match, same as the sheath terms below.
  const reactionTi = (g) => {
    const lnL = coulombLogEI(nNew[g], Te[g]);
    const tau_e = tauE(nNew[g], Te[g], lnL);
    const qei = equilibrationQei(nNew[g], Te[g], Ti[g], tau_e, mI);
    return qei / (1.5 * nNew[g] * EV_TO_J);
  };
  const wallRobinTi = (g) => {
    const seg = wallSegments.get(g);
    if (!seg) return null;
    const cs = soundSpeed(Te[g], Ti[g], params.muIonMasses);
    const bHat = ctx.wallField.get(g) || [1, 0];
    // ionHeatRobin already returns alpha scaled for this equation directly (see its own
    // unit note) -- no further division by n or EV_TO_J here.
    return ionHeatRobin(bHat, seg.normal, cs, nNew[g], params.deltaI1, seg.halfLength);
  };
  const { full: TiNew } = solveImplicitStep(mesh, dofMap, triGeom, massTi, Ti, dt, coeffTi, reactionTi, wallRobinTi, fixed.Ti);

  // --- 3. Electron energy: real Braginskii kappa_par_e + anomalous chi_perp_e + Q_ei + sheath ---
  const massTe = lumpedMass(mesh, triGeom, (g) => 1.5 * nNew[g]);
  const coeffTe = (t) => {
    const { tri } = triGeom[t];
    const nAvg = triAvg(nNew, tri), TeAvg = triAvg(Te, tri);
    const lnL = coulombLogEI(nAvg, TeAvg);
    const tau_e = tauE(nAvg, TeAvg, lnL);
    return { kappaPar: kappaParE(nAvg, TeAvg, tau_e), chiPerpN: params.chiPerp * nAvg };
  };
  const reactionTe = (g) => {
    const lnL = coulombLogEI(nNew[g], Te[g]);
    const tau_e = tauE(nNew[g], Te[g], lnL);
    const qei = equilibrationQei(nNew[g], Te[g], TiNew[g], tau_e, mI);
    return -qei / (1.5 * nNew[g] * EV_TO_J);
  };
  const deltaE = electronDelta(params.gammaE);
  const wallRobinTe = (g) => {
    const seg = wallSegments.get(g);
    if (!seg) return null;
    const cs = soundSpeed(Te[g], TiNew[g], params.muIonMasses);
    const bHat = ctx.wallField.get(g) || [1, 0];
    return electronHeatRobin(bHat, seg.normal, cs, nNew[g], deltaE, seg.halfLength);
  };
  const { full: TeNew } = solveImplicitStep(mesh, dofMap, triGeom, massTe, Te, dt, coeffTe, reactionTe, wallRobinTe, fixed.Te);

  return { n: nNew, Ti: TiNew, Te: TeNew };
}
