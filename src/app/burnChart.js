// Canvas line chart of real energy input vs. output over a selectable horizon, sampled
// directly from the burn model's closed form (src/fusion/burn.js) -- no simulation needed to
// preview hours of burn, since E(t) has an exact analytic expression at every t.
//
// "Output" is electric energy (via the same convertToElectric() the stat tiles use), not raw
// fusion energy -- that's the energy actually usable, and what should be weighed against the
// one-time magnet-activation input. "Input" is whatever the caller has actually spent so far
// (0 before Play is first pressed this shot, ITER_MAGNET_ENERGY_J after -- see
// src/fusion/activation.js and main.js's magnetActivated tracking), not a hardcoded constant,
// so the chart accurately reflects whether the cost has actually been incurred yet.
import { timeToEnergy } from "../fusion/burn.js";
import { convertToElectric } from "../fusion/capture.js";
import { formatEnergy, formatTime } from "./format.js";

const NSAMPLES = 200;

function fitTransform(width, height, margin, xMax, yMax) {
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  return (x, y) => [margin.left + (x / xMax) * plotW, margin.top + plotH - (y / yMax) * plotH];
}

// Draws the chart and returns the breakeven time (s, or null) so the caller can show it as a
// caption. `liveT`, if given and within the horizon, draws an extra marker at the burn
// model's current live elapsed time. `inputEnergyJ` is the input reference line (0 = magnet
// not yet activated this shot).
export function renderBurnChart(canvas, burnModel, mode, horizonSeconds, capture, inputEnergyJ, liveT = null) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const margin = { top: 14, right: 14, bottom: 28, left: 64 };

  const points = [];
  let yMax = 0;
  let captureFraction = 1;
  for (let i = 0; i <= NSAMPLES; i++) {
    const t = (horizonSeconds * i) / NSAMPLES;
    const { P, E } = burnModel.at(t, mode);
    const out = convertToElectric(P, E, burnModel, capture);
    captureFraction = out.captureFraction;
    points.push([t, out.E_electric]);
    if (out.E_electric > yMax) yMax = out.E_electric;
  }
  const referenceVisible = inputEnergyJ > 0 && inputEnergyJ > yMax * 0.02;
  yMax = Math.max(yMax, referenceVisible ? inputEnergyJ * 1.05 : yMax) * 1.05 || 1;

  const toPx = fitTransform(width, height, margin, horizonSeconds, yMax);

  ctx.fillStyle = "#fafaf8";
  ctx.fillRect(0, 0, width, height);

  // Axes
  ctx.strokeStyle = "#d8d8d3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const [ox, oy] = toPx(0, 0);
  const [xEnd] = toPx(horizonSeconds, 0);
  const [, yTop] = toPx(0, yMax);
  ctx.moveTo(ox, oy);
  ctx.lineTo(xEnd, oy);
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox, yTop);
  ctx.stroke();

  // Y-axis labels (0, mid, max)
  ctx.fillStyle = "#6a6a6a";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const frac of [0, 0.5, 1]) {
    const [, py] = toPx(0, yMax * frac);
    ctx.fillText(formatEnergy(yMax * frac), margin.left - 8, py);
  }

  // X-axis labels (0, mid, horizon)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const frac of [0, 0.5, 1]) {
    const [px] = toPx(horizonSeconds * frac, 0);
    ctx.fillText(formatTime(horizonSeconds * frac), px, oy + 6);
  }

  // Energy-in reference line (flat: the activation cost is paid once, at shot start)
  if (referenceVisible) {
    const [, refY] = toPx(0, inputEnergyJ);
    ctx.strokeStyle = "#e11d48";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(ox, refY);
    ctx.lineTo(xEnd, refY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#e11d48";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Energy in: magnet activation (${formatEnergy(inputEnergyJ)})`, ox + 6, refY - 3);
  }

  // Energy-out curve (electric)
  ctx.strokeStyle = "#0891b2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach(([t, E], i) => {
    const [px, py] = toPx(t, E);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.fillStyle = "#0891b2";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const lastPoint = points[points.length - 1];
  const [labelX, labelY] = toPx(lastPoint[0], lastPoint[1]);
  ctx.fillText("Energy out (electric)", Math.min(labelX, xEnd - 120), labelY - 6);

  // Breakeven: electric output crosses the input line. E_electric(t) = E_fusion(t) *
  // captureFraction (a fixed multiplier, since capture params don't depend on t), so solve
  // via the same closed-form inverse already used for raw fusion energy, at a rescaled target.
  const breakevenT =
    referenceVisible && captureFraction > 0 ? timeToEnergy(burnModel, mode, inputEnergyJ / captureFraction) : null;
  if (breakevenT != null && breakevenT <= horizonSeconds) {
    const [px, py] = toPx(breakevenT, inputEnergyJ);
    ctx.fillStyle = "#e11d48";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.fill();
  }

  if (liveT != null && liveT >= 0 && liveT <= horizonSeconds) {
    const { P, E } = burnModel.at(liveT, mode);
    const { E_electric } = convertToElectric(P, E, burnModel, capture);
    const [px, py] = toPx(liveT, E_electric);
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  return breakevenT;
}
