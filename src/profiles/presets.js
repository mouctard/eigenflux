// p'(psiN) and FF'(psiN) profile functions, where psiN in [0,1] is normalized flux with
// psiN = 0 at the magnetic axis and psiN = 1 at the boundary (the convention used
// throughout the analytic equilibrium literature, e.g. Cerfon & Freidberg 2010). Simple
// power-law taper:
//
//   p'(psiN)  = p0 * (1 - psiN)^alpha
//   FF'(psiN) = F0 * (1 - psiN)^alpha
//
// p0, F0 are solver-internal arbitrary units (mu0 absorbed into them) chosen for a
// visually clear qualitative effect -- not calibrated to real pressures/currents.

export const PROFILE_PRESETS = {
  lowBeta: { label: "Low β", p0: 0.3, F0: 1.0, alpha: 1.0 },
  highBeta: { label: "High β", p0: 1.6, F0: 1.0, alpha: 1.0 },
  peakedCurrent: { label: "Peaked current", p0: 0.6, F0: 1.0, alpha: 2.5 },
  broadCurrent: { label: "Broad current", p0: 0.6, F0: 1.0, alpha: 0.5 },
};

export function buildProfile({ p0, F0, alpha }) {
  const taper = (psiN) => Math.pow(Math.max(0, Math.min(1, 1 - psiN)), alpha);
  return {
    p: (psiN) => p0 * taper(psiN),
    FF: (psiN) => F0 * taper(psiN),
  };
}

// Cumulative pressure p(psiN), via analytic integration of p'(psiN) d(psiN) from the
// boundary (psiN=1, p=0) inward -- used for the pressure colormap.
export function buildPressureProfile({ p0, alpha }) {
  return (psiN) => {
    const t = Math.max(0, Math.min(1, 1 - psiN));
    return (p0 * Math.pow(t, alpha + 1)) / (alpha + 1);
  };
}
