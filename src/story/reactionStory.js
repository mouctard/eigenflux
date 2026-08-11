// Per-fuel narrative data for story.html -- the numbers a non-physicist reader sees (masses,
// Q, kinetic split) are the same real values already used/verified elsewhere in the app
// (src/fusion/fuels.js, src/fusion/reactivity.js); this module just packages them for the
// story's captions and animations.
//
// The kinetic-energy split between a reaction's two products is derived here from mass
// NUMBERS (proton count -- an integer stand-in for actual mass), not full nuclear masses, as
// an explicit, stated toy model: in the center-of-momentum frame the two products fly apart
// with equal and opposite momentum p, and KE = p^2/(2m), so KE_1/KE_2 = m_2/m_1. Checked
// against the real (measured) Q-value splits already used in fuels.js:
//   D-T:        KE_n/KE_alpha  ~ 4/1 = 4     (actual 14.1/3.5 = 4.03 -- 1% off)
//   D-D (n):    KE_n/KE_He3    ~ 3/1 = 3     (actual 2.45/0.82 = 2.99 -- <1% off)
//   D-D (p):    KE_p/KE_T      ~ 3/1 = 3     (actual 3.02/1.01 = 2.99 -- <1% off)
//   D-3He:      KE_p/KE_alpha  ~ 4/1 = 4     (actual 14.7/3.6 = 4.08 -- 2% off)
// Good enough to explain *why* the split happens (a real, correct physical reason -- momentum
// conservation plus unequal mass) without pretending the integer ratio is exact.

export const STORY_DATA = {
  dt: {
    label: "D-T",
    equation: "²D + ³T → ⁴He + n",
    reactants: [
      { label: "Deuterium", symbol: "D", massNumber: 2, charge: 1, color: "#0891b2" },
      { label: "Tritium", symbol: "T", massNumber: 3, charge: 1, color: "#e11d48" },
    ],
    products: [
      { label: "Helium-4 (α)", symbol: "⁴He", massNumber: 4, charge: 2, neutral: false, KE_MeV: 3.5, color: "#f59e0b" },
      { label: "Neutron", symbol: "n", massNumber: 1, charge: 0, neutral: true, KE_MeV: 14.1, color: "#64748b" },
    ],
    Q_MeV: 17.6,
    hasNeutron: true,
    branchNote: null,
  },
  dd: {
    label: "D-D",
    equation: "²D + ²D → ³He + n   (or → ³T + p, ~50/50)",
    reactants: [
      { label: "Deuterium", symbol: "D", massNumber: 2, charge: 1, color: "#0891b2" },
      { label: "Deuterium", symbol: "D", massNumber: 2, charge: 1, color: "#0891b2" },
    ],
    products: [
      { label: "Helium-3", symbol: "³He", massNumber: 3, charge: 2, neutral: false, KE_MeV: 0.82, color: "#7c3aed" },
      { label: "Neutron", symbol: "n", massNumber: 1, charge: 0, neutral: true, KE_MeV: 2.45, color: "#64748b" },
    ],
    Q_MeV: 3.27,
    hasNeutron: true,
    branchNote:
      "D-D actually has two roughly-equally-likely branches. This is the neutron-producing one (³He + n, Q = 3.27 MeV); the other (³T + p, Q = 4.03 MeV) is entirely charged particles, no neutron at all -- effectively half of a D-D plasma's reactions skip the whole blanket step below.",
  },
  dHe3: {
    label: "D-³He",
    equation: "²D + ³He → ⁴He + p",
    reactants: [
      { label: "Deuterium", symbol: "D", massNumber: 2, charge: 1, color: "#0891b2" },
      { label: "Helium-3", symbol: "³He", massNumber: 3, charge: 2, color: "#7c3aed" },
    ],
    products: [
      { label: "Helium-4 (α)", symbol: "⁴He", massNumber: 4, charge: 2, neutral: false, KE_MeV: 3.6, color: "#f59e0b" },
      { label: "Proton", symbol: "p", massNumber: 1, charge: 1, neutral: false, KE_MeV: 14.7, color: "#22c55e" },
    ],
    Q_MeV: 18.3,
    hasNeutron: false,
    branchNote:
      "This primary channel is aneutronic -- both products are charged, so (unlike D-T or D-D) there's no neutron step below at all: everything can, in principle, be harnessed directly rather than through a neutron-absorbing blanket. Real D-³He plasmas still have some D-D side reactions (above) with their own neutrons, not shown here.",
  },
};

export function parseStoryHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const fuelKey = params.get("fuel");
  const captureKey = params.get("capture");
  return {
    fuelKey: STORY_DATA[fuelKey] ? fuelKey : "dt",
    captureKey: captureKey === "directConversion" ? "directConversion" : "blanketSteam",
  };
}
