// Edge-localized-mode (ELM) relaxation: the real, named periodic edge relaxation seen in
// Type-I ELMy H-mode -- a "recovery -> precursor -> collapse" cycle (Zohm 1996; Connor,
// "Edge Localised Modes: ELMs") driven by the pedestal pressure gradient and edge current
// jointly crossing a peeling-ballooning stability threshold. Distinct from the core sawtooth
// in src/fusion/sawtooth.js: this is an edge phenomenon (no q=1 surface involved), and
// unlike a sawtooth's slow-reheat/fast-crash shape, the D-alpha signature it produces is the
// other way around -- a sharp rise as the crash dumps particles/heat into recycling neutrals
// at the edge, then a decay (modeled here as a real first-order/exponential relaxation, not
// a sinusoid) as those neutrals clear before the next crash.
//
// Real numbers checked against the literature before use, same standard as this project's
// other cited formulas:
//  - Type-I ELMs only occur above the H-mode power threshold P_LH (already computed live on
//    this page via the Martin08 scaling, src/fusion/diagnostics.js's computeLHThreshold) --
//    below it there's no pedestal transport barrier to relax, so f_ELM = 0.
//  - Frequency increases with heating power above threshold (Type-I; Type-III/small-ELM
//    regimes do the opposite and aren't modeled here) -- rather than invent a P/P_LH-to-Hz
//    curve fit (no single agreed-on one exists in the literature we could verify), this uses
//    the more robustly cross-device-established power-balance identity: the power an ELMy
//    plasma sheds through ELMs, f_ELM*deltaW_ELM, is empirically ~0.3-0.4 of the input power
//    (multiple devices; ELM_POWER_FRACTION below takes the middle). deltaW_ELM (the pedestal
//    energy lost per crash) is commonly cited at ~10-15% of pedestal stored energy
//    (ELM_ENERGY_FRACTION below); this page has no separate pedestal/core split, so W_th
//    stands in for W_ped, the same simplification already used for tau_E elsewhere.
const ELM_POWER_FRACTION = 0.35; // f_ELM * deltaW_ELM ~= this * P_heat (cross-device, ~0.3-0.4)
const ELM_ENERGY_FRACTION = 0.12; // deltaW_ELM ~= this * W_th (cited ~10-15% of pedestal energy)
const MIN_FREQ_HZ = 0.1; // clamped so a barely-above-threshold shot still shows visible ELMs
// Clamped to ~1/10th of the dashboard's ~15Hz (66ms) redraw rate (src/app/main.js's
// REDRAW_INTERVAL_MS), not a physics limit -- real Type-I ELMs go well past 15Hz on some
// devices, but sampled at only ~2-3x its own frequency the shot-trace history would alias a
// real spike-and-decay signal into a misleadingly smooth-looking one. ~10 samples/period
// keeps the actual shape (sharp rise, exponential decay) visibly a spike, not a sine.
const MAX_FREQ_HZ = 1.5;

// f_ELM (Hz), or 0 below the H-mode power threshold. Gated on P_aux vs. P_LH -- the same
// auxiliary-heating-vs-threshold comparison this page's own H-mode/L-mode regime badge
// already uses (renderDiagnostics's `isHMode`), so the two never disagree. The frequency
// magnitude itself uses P_in (total input power: ohmic + auxiliary + alpha), matching what
// the f_ELM*deltaW_ELM ~= 0.3-0.4*P_in identity above is actually stated in terms of.
export function elmFrequencyHz(P_aux_MW, P_LH_MW, P_in_MW, Wth_J) {
  if (!(P_aux_MW > P_LH_MW) || !(Wth_J > 0)) return 0;
  const dW_ELM_J = ELM_ENERGY_FRACTION * Wth_J;
  const f = (ELM_POWER_FRACTION * P_in_MW * 1e6) / dW_ELM_J;
  return Math.max(MIN_FREQ_HZ, Math.min(MAX_FREQ_HZ, f));
}

// Returns a value in [0, 1]: 1 right at a crash, decaying exponentially over the rest of the
// period as recycling neutrals clear -- a real first-order relaxation, not a sin() spike.
// Evaluated at `elapsedRealSeconds` (real wall-clock time since ignition, like the sawtooth
// envelope -- a real-time phenomenon, not scaled by the burn-speed multiplier).
export function elmEnvelope(elapsedRealSeconds, periodSeconds) {
  if (!(periodSeconds > 0)) return 0;
  const t = Math.max(0, elapsedRealSeconds);
  const phase = (t % periodSeconds) / periodSeconds; // 0..1, 0 = crash just happened
  const decayConst = 5; // decays to exp(-5) ~= 0.007 of peak by the next crash
  return Math.exp(-decayConst * phase);
}
