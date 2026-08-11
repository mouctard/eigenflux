// Number formatting for the reactor readout -- pure presentation, no physics here.

export function formatTime(s) {
  if (s < 60) return s.toFixed(1) + " s";
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}m ${rem.toFixed(0)}s`;
}

export function formatPower(W) {
  return (W / 1e6).toFixed(1) + " MW";
}

export function formatEnergy(J) {
  if (J < 1e6) return (J / 1e3).toFixed(1) + " kJ";
  if (J < 1e9) return (J / 1e6).toFixed(1) + " MJ";
  return (J / 1e9).toFixed(2) + " GJ";
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
