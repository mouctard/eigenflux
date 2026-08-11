// Number formatting for the reactor readout -- pure presentation, no physics here.

export function formatTime(s) {
  if (s < 60) return s.toFixed(1) + " s";
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s - m * 60;
    return `${m}m ${rem.toFixed(0)}s`;
  }
  const h = Math.floor(s / 3600);
  const remM = Math.floor((s - h * 3600) / 60);
  return `${h}h ${remM}m`;
}

export function formatPower(W) {
  // Tiered like formatEnergy -- some fuel/temperature pairings (e.g. D-3He at D-T-range
  // temperatures) are deliberately, physically tiny, and a flat "0.0 MW" would hide that
  // rather than show it.
  if (W < 1) return W.toFixed(2) + " W";
  if (W < 1e3) return W.toFixed(1) + " W";
  if (W < 1e6) return (W / 1e3).toFixed(1) + " kW";
  return (W / 1e6).toFixed(1) + " MW";
}

export function formatEnergy(J) {
  if (J < 1e6) return (J / 1e3).toFixed(1) + " kJ";
  if (J < 1e9) return (J / 1e6).toFixed(1) + " MJ";
  if (J < 1e12) return (J / 1e9).toFixed(2) + " GJ";
  return (J / 1e12).toFixed(2) + " TJ";
}

// For a net (output minus input) balance, which starts negative right after the one-time
// activation cost is paid -- formatEnergy's tiering assumes J >= 0, so this handles sign
// separately rather than passing a negative straight through.
export function formatSignedEnergy(J) {
  const sign = J < 0 ? "−" : "+";
  return sign + formatEnergy(Math.abs(J));
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻";

function formatSci(x, unit) {
  if (!(x > 0)) return "0" + unit;
  const exp = Math.floor(Math.log10(x));
  const mant = x / Math.pow(10, exp);
  const sup = String(exp)
    .split("")
    .map((c) => SUPERSCRIPT[c === "-" ? 10 : Number(c)])
    .join("");
  return `${mant.toFixed(2)}×10${sup}${unit}`;
}

export function formatRate(perSec) {
  return formatSci(perSec, "/s");
}

export function formatDensity(perM3) {
  return formatSci(perM3, " m⁻³");
}

// ---- New formatters for the diagnostics dashboard ------------------------------------

export function formatTesla(T) {
  return T.toFixed(2) + " T";
}

export function formatMA(MA) {
  return MA.toFixed(2) + " MA";
}

export function formatKeV(keV) {
  return keV.toFixed(2) + " keV";
}

// q_95, l_i, H98 -- plain dimensionless ratios.
export function formatDimensionless(x) {
  return x.toFixed(2);
}

// Fixed-scale MW display (unlike formatPower's auto-tiering W/kW/MW), for quantities that are
// always reported in MW on real tokamaks (heating powers, power balance terms).
export function formatMW(MW) {
  return MW.toFixed(1) + " MW";
}

export function formatMWm2(MWm2) {
  return MWm2.toFixed(1) + " MW/m²";
}

export function formatCelsius(C) {
  return Math.round(C) + " °C";
}

export function formatMM(mm) {
  return mm.toFixed(1) + " mm";
}
