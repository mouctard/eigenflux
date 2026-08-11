// Real-unit tokamak "operating point" presets: toroidal field, plasma current, and auxiliary
// heating actuator powers. These can't be derived from the Grad-Shafranov solve's arbitrary-
// unit profile amplitudes (see index.html's "Units" panel), so -- matching the project's
// existing pattern for the burn model's T/n operating points (src/fusion/presets.js,
// explicitly "illustrative... not derived from the equilibrium solve") -- they're new,
// separately-real-unit inputs a preset selects. See index.html's "Plasma diagnostics" panel
// for what's genuinely computed from these (beta_N, q_95, tau_E, H98, power balance, the
// H-mode/L-mode gate) versus what stays illustrative.
//
// Real reference parameters (verified this session): JET R0=2.96m, a=1.25m, Bt<=3.45T,
// Ip<=3.2MA(circular)/4.8MA(D-shaped), P_heat<=38MW. DIII-D R0=1.66m, a=0.67m, Bt<=2.2T,
// Ip<=2MA, P_heat~23MW.
export const OPERATING_POINT_PRESETS = {
  jetLike: {
    label: "JET-scale",
    description: "Bt=3.11T, Ip=3.50MA -- JET-scale field/current (JET: Bt<=3.45T, Ip<=4.8MA).",
    Bt_T: 3.11,
    Ip_MA: 3.5,
    P_OH_MW: 0.5,
    P_NBI_MW: 23.5,
    P_ECH_MW: 0.0,
    P_ICH_MW: 3.8,
  },
  diiidLike: {
    label: "DIII-D-scale",
    description: "Bt=2.10T, Ip=1.80MA -- DIII-D-scale field/current (DIII-D: Bt<=2.2T, Ip<=2MA).",
    Bt_T: 2.1,
    Ip_MA: 1.8,
    P_OH_MW: 0.3,
    P_NBI_MW: 15.0,
    P_ECH_MW: 2.0,
    P_ICH_MW: 1.5,
  },
};
