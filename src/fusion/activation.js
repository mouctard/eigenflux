// Reference "activation energy" for the energy-vs-time chart: how much energy it takes to
// even get a real reactor's confinement field running before any fusion happens, for scale
// against cumulative fusion output.
//
// This is deliberately NOT derived from the solver's own state -- the profile amplitudes
// (p0, F0) are explicitly documented as solver-internal arbitrary units, not real tesla/amps
// (see index.html's "Units" panel section), so there's no physically meaningful "magnet
// energy" to compute from them. Instead this cites a real, documented figure for an actual
// device, for an honest order-of-magnitude comparison.
//
// ITER's superconducting magnet system (18 toroidal-field coils + central solenoid +
// poloidal-field coils) stores a combined 51 GJ when energized -- the toroidal field coils
// alone store 41 GJ, the central solenoid 6.4 GJ. Source: iter.org, "ITER Superconducting
// Magnets" (https://www.iter.org/machine/magnets).
export const ITER_MAGNET_ENERGY_J = 51e9;
export const ITER_MAGNET_ENERGY_LABEL = "ITER's magnet system (51 GJ)";
