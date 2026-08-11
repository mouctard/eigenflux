// Real stellarator configurations, exported from DESC's own precomputed solved
// equilibria (see tools/export_stellarators.py). NFP values here are the real physical
// field-period counts of these devices/designs, confirmed against the loaded equilibria.
// Illustrative reactor-ballpark operating point for the burn simulation -- the same
// epistemic status as the tokamak page's per-profile FUSION_OPERATING_POINTS (see
// src/fusion/presets.js), just a single fixed point here since this page has no
// steady-state profile choice. NOT these devices' real (far colder, thinner) experimental
// operating conditions -- see stellarator.html's "How this works" panel.
export const ILLUSTRATIVE_OPERATING_POINT = { T_keV: 12, n0_m3: 1e20 };

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
