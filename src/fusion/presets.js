// Illustrative reactor-ballpark operating points (temperature, fuel density) per
// steady-state profile preset. Deliberately decoupled from the Grad-Shafranov solver's
// arbitrary-unit p0/F0 constants (see src/profiles/presets.js) -- these are physical
// values (keV, m^-3) chosen to be in a realistic tokamak-relevant range (ITER targets
// ~10-20 keV, ~1e20 m^-3), not derived from the equilibrium solve itself.
export const FUSION_OPERATING_POINTS = {
  lowBeta: { T_keV: 8, n0_m3: 0.6e20 },
  highBeta: { T_keV: 15, n0_m3: 1.1e20 },
  peakedCurrent: { T_keV: 12, n0_m3: 0.9e20 },
  broadCurrent: { T_keV: 6, n0_m3: 0.7e20 },
};

export const E_DT_JOULES = 17.6e6 * 1.602176634e-19; // 17.6 MeV per D-T reaction
