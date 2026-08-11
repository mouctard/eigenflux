// Fusion reactivity <sigma*v>(T), Bosch & Hale (1992) parametrization ("Improved formulas
// for fusion cross-sections and thermal reactivities", Nucl. Fusion 32 611).
//
// The D-T channel's coefficients and verification below are unchanged from before this file
// grew D-D/D-He3 support -- refactored into a shared factory (boschHale) so all four reaction
// channels use one formula instead of four hand-copied implementations, cutting the risk of a
// copy-paste coefficient mixup. See tools/validate_reactivity.mjs for a from-scratch
// cross-check of all four channels (including a byte-for-byte D-T before/after diff) against
// an independently reproduced copy of the paper's Table 5/6: T.A. Heltemes, G.A. Moses,
// J.F. Santarius, "Analysis of an Improved Fusion Reaction Rate Model for Use in Fusion
// Plasma Simulations", UWFDM-1268, U. Wisconsin Fusion Technology Institute (2005).
//
// B_G (the Gamow constant) is computed from its defining formula, B_G = pi*alpha*Z1*Z2*
// sqrt(2*mrc2) (Bosch & Hale eq. 2), rather than hand-copied per reaction -- one fewer magic
// number per channel, and it reproduces the D-T value (34.3827) already verified below to 4
// significant figures.
const ALPHA = 1 / 137.035999084; // fine-structure constant (CODATA)

function gamow(Z1, Z2, mrc2_keV) {
  return Math.PI * ALPHA * Z1 * Z2 * Math.sqrt(2 * mrc2_keV);
}

// Returns a function T_keV -> <sigma*v> in m^3/s, given a reaction's Bosch-Hale coefficients.
function boschHale({ B_G, mrc2, C1, C2, C3, C4, C5, C6, C7 }) {
  return function sigmaV(T_keV) {
    const T = T_keV;
    const theta = T / (1 - (T * (C2 + T * (C4 + T * C6))) / (1 + T * (C3 + T * (C5 + T * C7))));
    const psi = Math.cbrt((B_G * B_G) / (4 * theta));
    const sv_cm3_per_s = C1 * theta * Math.sqrt(psi / (mrc2 * T * T * T)) * Math.exp(-3 * psi);
    return sv_cm3_per_s * 1e-6; // cm^3/s -> m^3/s
  };
}

// D(T,n)4He -- valid 0.2-100 keV.
// Verified against known reference values before use in this project:
//   sigmaV(10)  = 1.136e-22 m^3/s   (textbook value ~1.1e-22 m^3/s)
//   sigmaV(65)  ~ peak, 8.94e-22 m^3/s (matches the well-known DT reactivity peak)
export const sigmaV = boschHale({
  B_G: 34.3827,
  mrc2: 1124656.0,
  C1: 1.17302e-9,
  C2: 1.51361e-2,
  C3: 7.51886e-2,
  C4: 4.60643e-3,
  C5: 1.35e-2,
  C6: -1.0675e-4,
  C7: 1.366e-5,
});

// D(d,p)T -- one of D-D's two ~50/50 branches (the other producing a neutron, below).
// Valid 0.2-100 keV. Z1=Z2=1 (D+D).
export const sigmaVDDp = boschHale({
  B_G: gamow(1, 1, 937814),
  mrc2: 937814,
  C1: 5.66e-12,
  C2: 3.41e-3,
  C3: 1.99e-3,
  C4: 0,
  C5: 1.05e-5,
  C6: 0,
  C7: 0,
});

// D(d,n)3He -- D-D's other branch. Valid 0.2-100 keV.
export const sigmaVDDn = boschHale({
  B_G: gamow(1, 1, 937814),
  mrc2: 937814,
  C1: 5.43e-12,
  C2: 5.86e-3,
  C3: 7.68e-3,
  C4: 0,
  C5: -2.96e-6,
  C6: 0,
  C7: 0,
});

// 3He(d,p)4He (D-3He) -- Z1=1 (D), Z2=2 (3He). Valid 0.5-190 keV.
export const sigmaVDHe3 = boschHale({
  B_G: gamow(1, 2, 1124572),
  mrc2: 1124572,
  C1: 5.51e-10,
  C2: 6.42e-3,
  C3: -2.03e-3,
  C4: -1.91e-5,
  C5: 1.36e-4,
  C6: 0,
  C7: 0,
});
