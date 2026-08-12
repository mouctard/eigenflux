// Sawtooth relaxation oscillation: the real, named periodic core-temperature relaxation seen
// in tokamaks, from repeated partial magnetic reconnection at the q=1 surface (the m/n=1/1
// internal-kink instability -- Kadomtsev, "Disruptive instability in tokamaks," Sov. J.
// Plasma Phys. 1 (1975), 389). NOT sinusoidal: a slow quasi-linear reheat between crashes,
// then a fast collapse as reconnection redistributes core heat outward. Used to drive the 2D/
// 3D tokamak views' core "throb" instead of an arbitrary sin() oscillation.
//
// Real numbers checked against the literature before use, same as this project's other cited
// formulas (Bosch-Hale, Eich 2013, Martin08, IPB98(y,2)):
//  - Crash timescale: ~100 microseconds (tokamak soft-X-ray sawtooth-collapse studies, e.g.
//    HT-7) -- many orders of magnitude shorter than the period, so on-screen it's compressed
//    to CRASH_FRACTION of the period purely for visibility at real-time frame rates (still
//    asymmetric/fast vs. the ramp, just not literally sub-frame-rate).
//  - Central-temperature crash depth: commonly cited ~15-30% (one tokamak soft-X-ray case:
//    ~300 eV pre-crash -> ~250 eV post-crash, ~17%); CRASH_DEPTH picks the middle of that
//    range.
//  - Period: strongly device/regime dependent (no universal formula), but commonly cited as a
//    small multiple of the energy confinement time tau_E -- e.g. ASDEX Upgrade
//    high-performance shots: ~150ms period vs. ~80ms tau_E, a ratio of ~1.9. PERIOD_TO_TAUE
//    below uses that ratio (rounded) against tau_E, which this page already computes live
//    (src/app/main.js's renderDiagnostics -> tauE_actual = W_th/P_loss).
const CRASH_DEPTH = 0.25; // central-temperature fraction lost at each crash
const CRASH_FRACTION = 0.08; // fraction of the period the crash occupies (visually compressed)
const PERIOD_TO_TAUE = 1.5; // tau_saw ~= PERIOD_TO_TAUE * tau_E, per the ASDEX Upgrade example
const MIN_PERIOD_S = 0.3; // clamped so it stays perceptible at very short tau_E
const MAX_PERIOD_S = 4.0; // clamped so it doesn't feel frozen at very long tau_E

// Returns a value in [1-CRASH_DEPTH, 1]: the real, asymmetric ramp-then-crash envelope,
// evaluated at `elapsedRealSeconds` (real wall-clock time since ignition -- like the magnet
// ramp, this isn't scaled by the burn-speed multiplier, since it's a real-time phenomenon,
// not part of the sped-up depletion clock).
export function sawtoothEnvelope(elapsedRealSeconds, tauE_s) {
  const period = Math.max(MIN_PERIOD_S, Math.min(MAX_PERIOD_S, tauE_s > 0 ? tauE_s * PERIOD_TO_TAUE : MIN_PERIOD_S));
  const t = Math.max(0, elapsedRealSeconds);
  const phase = (t % period) / period; // 0..1
  const rampEnd = 1 - CRASH_FRACTION;
  if (phase < rampEnd) {
    // Slow reheat: linear rise from the post-crash floor back up to full, as steady heating
    // rebuilds the core temperature until the next kink-unstable threshold is crossed.
    return (1 - CRASH_DEPTH) + CRASH_DEPTH * (phase / rampEnd);
  }
  // Fast crash: reconnection redistributes core heat outward almost immediately.
  const crashPhase = (phase - rampEnd) / CRASH_FRACTION;
  return 1 - CRASH_DEPTH * crashPhase;
}
