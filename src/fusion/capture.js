// Energy-capture technology presets: how much of the raw fusion power (src/fusion/burn.js)
// becomes electricity a grid can actually use. This is an engineering-accounting layer, not
// nuclear physics -- it's a pure function of the burn model's already-computed P/E and the
// resolved fuel's neutron/charged energy split (src/fusion/fuels.js). No new physics claims
// here, only conversion-technology assumptions.
//
// Unlike the Bosch-Hale reactivities (checked against a reference table to <0.4%) or the
// Solov'ev-validated solver, these multiplier/efficiency numbers are illustrative literature
// ballparks for conceptual reactor designs, not a specific engineering design -- same
// epistemic status the project already uses for the burn model's T/n operating points
// (src/fusion/presets.js). Typical cited ranges:
//   - Li/Be breeder blanket neutron energy multiplication: ~1.1-1.3
//   - Steam (Rankine) thermal-to-electric efficiency, nuclear/fusion conceptual designs: ~30-40%
//   - Direct (electrostatic) conversion of charged fusion products: theoretical ~60-90%,
//     experimental only, never deployed at reactor scale
export const CAPTURE_PRESETS = {
  blanketSteam: {
    label: "Blanket + steam turbine",
    description: "Li/Be breeder blanket multiplies neutron energy, both neutron and charged-particle heat drive a steam turbine.",
    blanketMultiplier: 1.15,
    thermalEfficiency: 0.34,
    capturesNeutrons: true,
    capturesCharged: true,
  },
  directConversion: {
    label: "Direct conversion",
    description: "Electrostatic direct conversion of charged fusion products only -- no blanket, neutron energy isn't captured at all.",
    blanketMultiplier: 1.0,
    thermalEfficiency: 0.6,
    capturesNeutrons: false,
    capturesCharged: true,
  },
};

// Pure function: raw fusion P (W) / E (J) plus the burn model's resolved neutron/charged
// split -> net electric power/energy. No new nuclear physics -- see module comment above.
export function convertToElectric(P_W, E_J, { neutronFrac, chargedFrac }, capture) {
  const neutronShare = capture.capturesNeutrons ? neutronFrac * capture.blanketMultiplier : 0;
  const chargedShare = capture.capturesCharged ? chargedFrac : 0;
  const captureFraction = (neutronShare + chargedShare) * capture.thermalEfficiency;
  return {
    P_electric: P_W * captureFraction,
    E_electric: E_J * captureFraction,
    captureFraction,
  };
}
