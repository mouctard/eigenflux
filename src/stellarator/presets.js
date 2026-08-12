// Real stellarator configurations, exported from DESC's own precomputed solved
// equilibria (see tools/export_stellarators.py). NFP values here are the real physical
// field-period counts of these devices/designs, confirmed against the loaded equilibria.
// Illustrative reactor-ballpark operating point for the burn simulation -- the same
// epistemic status as the tokamak page's per-profile FUSION_OPERATING_POINTS (see
// src/fusion/presets.js), just a single fixed point here since this page has no
// steady-state profile choice. NOT these devices' real (far colder, thinner) experimental
// operating conditions -- see stellarator.html's "How this works" panel.
//
// P_heat_MW is a similarly illustrative total input-heating figure (this page has no
// Bt/Ip/heating "Operating point" preset to derive one from the way the tokamak page does),
// used only for a minimal power balance -> tau_E = W_th/P_loss, itself only shown as a plain
// diagnostic number here -- NOT used to drive any core-relaxation oscillation the way it is
// on the tokamak page, because that oscillation (a real sawtooth, src/fusion/sawtooth.js) is
// a tokamak-specific m/n=1/1 internal-kink instability tied to a q=1 rational surface from a
// net toroidal current profile. W7-X's vacuum rotational-transform profile is flat and
// doesn't cross a low-order rational surface at all (sawtooth-like crashes there have only
// been produced deliberately, with off-axis ECCD current drive -- not this page's modeled
// scenario), so borrowing the tokamak's sawtooth here would be physically dishonest, not
// just illustrative. See stellarator.html's "How this works" for the full writeup.
export const ILLUSTRATIVE_OPERATING_POINT = { T_keV: 12, n0_m3: 1e20, P_heat_MW: 25 };

export const STELLARATOR_PRESETS = {
  w7x: {
    label: "Wendelstein 7-X",
    file: "data/stellarators/w7x.bin",
    note: "Operating superconducting stellarator, Max Planck IPP, Greifswald, Germany (NFP 5).",
  },
  hsx: {
    label: "HSX",
    file: "data/stellarators/hsx.bin",
    note: "Helically Symmetric Experiment, University of Wisconsin–Madison (NFP 4).",
  },
  ncsx: {
    label: "NCSX",
    file: "data/stellarators/ncsx.bin",
    note: "National Compact Stellarator Experiment design, PPPL (NFP 3).",
  },
};
