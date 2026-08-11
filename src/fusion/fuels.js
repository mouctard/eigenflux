// Selectable fusion fuel cycles. Each fuel is a list of reaction branches (a self-reaction
// like D-D has two roughly-50/50 channels; cross-species reactions like D-T and D-3He have
// one), plus a pairFactor distinguishing identical-reactant self-reactions (pairFactor=0.5,
// the standard pair-counting factor for e.g. D+D) from cross-species reactions (pairFactor=1,
// assuming equal initial densities of the two species -- same assumption the original D-T-only
// code already made). See src/fusion/burn.js for the closed-form derivation this feeds.
//
// Q values (MeV) and product energy splits are standard nuclear data:
//   D-T:   D + T  -> 4He(3.5) + n(14.1),   Q=17.6
//   D-D:   D + D  -> T(1.01) + p(3.02),    Q=4.03  (all charged)
//          D + D  -> 3He(0.82) + n(2.45),  Q=3.27
//   D-3He: D + 3He -> 4He(3.6) + p(14.7),  Q=18.3  (aneutronic primary channel; real D-3He
//          plasmas still have D-D side reactions and their neutrons -- not modeled here)
import { sigmaV, sigmaVDDp, sigmaVDDn, sigmaVDHe3 } from "./reactivity.js";

export const MEV_JOULES = 1.602176634e-13; // 1 MeV in Joules

export const FUEL_PRESETS = {
  dt: {
    label: "D-T",
    reaction: "D + T → ⁴He + n",
    pairFactor: 1,
    species: [
      { key: "d", label: "Deuterium", colorClass: "d" },
      { key: "t", label: "Tritium", colorClass: "t" },
    ],
    branches: [{ sigmaV, Q_MeV: 17.6, neutronFrac: 14.1 / 17.6 }],
  },
  dd: {
    label: "D-D",
    reaction: "D + D → T + p, or ³He + n (~50/50)",
    pairFactor: 0.5,
    species: [{ key: "d", label: "Deuterium", colorClass: "d" }],
    branches: [
      { sigmaV: sigmaVDDp, Q_MeV: 4.03, neutronFrac: 0 },
      { sigmaV: sigmaVDDn, Q_MeV: 3.27, neutronFrac: 2.45 / 3.27 },
    ],
  },
  dHe3: {
    label: "D-³He",
    reaction: "D + ³He → ⁴He + p",
    pairFactor: 1,
    species: [
      { key: "d", label: "Deuterium", colorClass: "d" },
      { key: "he3", label: "Helium-3", colorClass: "he3" },
    ],
    branches: [{ sigmaV: sigmaVDHe3, Q_MeV: 18.3, neutronFrac: 0 }],
  },
};

// Sums a fuel's branches at a fixed operating temperature into the effective quantities the
// closed-form burn solution (src/fusion/burn.js) needs. Evaluated once per (fuel, T) pair
// since T is fixed for the duration of a burn simulation.
export function resolveFuel(fuel, T_keV) {
  let effectiveSigmaV = 0;
  let effectiveSigmaVQ_J = 0;
  let neutronSigmaVQ_J = 0;
  for (const branch of fuel.branches) {
    const sv = branch.sigmaV(T_keV);
    const svQ = sv * branch.Q_MeV * MEV_JOULES;
    effectiveSigmaV += sv;
    effectiveSigmaVQ_J += svQ;
    neutronSigmaVQ_J += svQ * branch.neutronFrac;
  }
  const neutronFrac = effectiveSigmaVQ_J > 0 ? neutronSigmaVQ_J / effectiveSigmaVQ_J : 0;
  // Energy-weighted average Q per reaction (J) -- only differs from a single branch's Q when
  // a fuel has multiple channels with different Q (D-D). Used to convert power back to a raw
  // reaction rate (reactions/s), since power alone conflates rate and energy-per-reaction.
  const avgQ_J = effectiveSigmaV > 0 ? effectiveSigmaVQ_J / effectiveSigmaV : 0;
  return {
    pairFactor: fuel.pairFactor,
    effectiveSigmaV,
    effectiveSigmaVQ_J,
    avgQ_J,
    neutronFrac,
    chargedFrac: 1 - neutronFrac,
  };
}
