// Real stellarator configurations, exported from DESC's own precomputed solved
// equilibria (see tools/export_stellarators.py). NFP values here are the real physical
// field-period counts of these devices/designs, confirmed against the loaded equilibria.
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
