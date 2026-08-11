// D-T fusion reactivity <sigma*v>(T), Bosch & Hale (1992) parametrization
// ("Improved formulas for fusion cross-sections and thermal reactivities",
// Nucl. Fusion 32 611). Coefficients for the D(T,n)He4 reaction, valid for
// T in [0.2, 100] keV.
//
// Verified against known reference values before use in this project:
//   sigmaV(10)  = 1.136e-22 m^3/s   (textbook value ~1.1e-22 m^3/s)
//   sigmaV(65)  ~ peak, 8.94e-22 m^3/s (matches the well-known DT reactivity peak)
const C1 = 1.17302e-9;
const C2 = 1.51361e-2;
const C3 = 7.51886e-2;
const C4 = 4.60643e-3;
const C5 = 1.35e-2;
const C6 = -1.0675e-4;
const C7 = 1.366e-5;
const B_G = 34.3827; // sqrt(keV), Gamow constant for D-T
const MRC2 = 1124656.0; // keV, reduced-mass energy

// Returns <sigma*v> in m^3/s for temperature T in keV.
export function sigmaV(T_keV) {
  const T = T_keV;
  const theta = T / (1 - (T * (C2 + T * (C4 + T * C6))) / (1 + T * (C3 + T * (C5 + T * C7))));
  const psi = Math.cbrt((B_G * B_G) / (4 * theta));
  const sv_cm3_per_s = C1 * theta * Math.sqrt(psi / (MRC2 * T * T * T)) * Math.exp(-3 * psi);
  return sv_cm3_per_s * 1e-6; // cm^3/s -> m^3/s
}
