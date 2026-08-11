// Canvas line chart of cumulative energy E(t) over a selectable horizon, sampled directly
// from the burn model's closed form (src/fusion/burn.js) -- no simulation needed to preview
// hours of burn, since E(t) has an exact analytic expression at every t.
import { timeToEnergy } from "../fusion/burn.js";
import { ITER_MAGNET_ENERGY_J, ITER_MAGNET_ENERGY_LABEL } from "../fusion/activation.js";
import { formatEnergy, formatTime } from "./format.js";

const NSAMPLES = 200;

function fitTransform(width, height, margin, xMax, yMax) {
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  return (x, y) => [margin.left + (x / xMax) * plotW, margin.top + plotH - (y / yMax) * plotH];
}

// Draws the chart and returns the payback time (s, or null) so the caller can show it as a
// caption. `liveT`, if given and within the horizon, draws an extra marker at the burn
// model's current live elapsed time -- cheap enough to redraw the whole chart every frame
// alongside the existing full-mesh redraw this project already does at ~15 Hz.
export function renderBurnChart(canvas, burnModel, mode, horizonSeconds, liveT = null) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const margin = { top: 14, right: 14, bottom: 28, left: 64 };

  const points = [];
  let yMax = 0;
  for (let i = 0; i <= NSAMPLES; i++) {
    const t = (horizonSeconds * i) / NSAMPLES;
    const { E } = burnModel.at(t, mode);
    points.push([t, E]);
    if (E > yMax) yMax = E;
  }
  const referenceVisible = ITER_MAGNET_ENERGY_J > yMax * 0.02; // don't bother if it'd be off-scale-tiny
  yMax = Math.max(yMax, referenceVisible ? ITER_MAGNET_ENERGY_J * 1.05 : yMax) * 1.05 || 1;

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

  // ITER magnet-energy reference line
  if (referenceVisible) {
    const [, refY] = toPx(0, ITER_MAGNET_ENERGY_J);
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
    ctx.fillText(ITER_MAGNET_ENERGY_LABEL, ox + 6, refY - 3);
  }

  // Energy curve
  ctx.strokeStyle = "#0891b2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach(([t, E], i) => {
    const [px, py] = toPx(t, E);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  const paybackT = timeToEnergy(burnModel, mode, ITER_MAGNET_ENERGY_J);
  if (paybackT != null && paybackT <= horizonSeconds) {
    const [px, py] = toPx(paybackT, ITER_MAGNET_ENERGY_J);
    ctx.fillStyle = "#e11d48";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.fill();
  }

  if (liveT != null && liveT >= 0 && liveT <= horizonSeconds) {
    const { E: liveE } = burnModel.at(liveT, mode);
    const [px, py] = toPx(liveT, liveE);
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  return paybackT;
}
