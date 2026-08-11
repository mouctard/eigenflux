// Scrolling "shot trace" chart: four stacked mini strip-charts (Ip, beta_N, D-alpha, W_th),
// each on its own y-scale -- the way real tokamak control-room trace displays actually look
// (separate strips per channel), rather than one shared axis. Unlike burnChart.js (which
// samples a closed-form E(t) over an arbitrary future horizon), this renders a rolling
// history buffer of already-computed samples pushed once per animation frame (main.js),
// since the magnet ramp and flat-top jitter driving these values are inherently time-stepped,
// not a closed form.
import { getCanvasPalette } from "./theme.js";

const STRIPS = [
  { key: "Ip_MA", label: "Ip (MA)", color: "#0891b2" },
  { key: "betaN", label: "β_N", color: "#7c3aed" },
  { key: "dAlpha", label: "D-α (a.u.)", color: "#e11d48" },
  { key: "Wth_MJ", label: "W_th (MJ)", color: "#ea580c" },
];

export function renderShotChart(canvas, history, setpoints, windowSeconds) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const palette = getCanvasPalette();
  ctx.fillStyle = palette.canvasBg;
  ctx.fillRect(0, 0, width, height);

  if (!history || history.length < 2) {
    ctx.fillStyle = palette.chartLabel;
    ctx.font = "12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Press Play to start a shot trace", width / 2, height / 2);
    return;
  }

  const tMax = history[history.length - 1].t;
  const tMin = Math.max(0, tMax - windowSeconds);

  const stripH = height / STRIPS.length;
  const margin = { left: 56, right: 10, top: 6, bottom: 6 };

  STRIPS.forEach((strip, si) => {
    const top = si * stripH;
    const plotTop = top + margin.top;
    const plotBottom = top + stripH - margin.bottom;
    const plotLeft = margin.left;
    const plotRight = width - margin.right;

    let yMax = setpoints[strip.key] > 0 ? setpoints[strip.key] * 1.3 : 0.01;
    for (const s of history) {
      if (s.t < tMin) continue;
      if (s[strip.key] > yMax) yMax = s[strip.key] * 1.05;
    }

    const toPx = (t, v) => [
      plotLeft + ((t - tMin) / (tMax - tMin || 1)) * (plotRight - plotLeft),
      plotBottom - (Math.max(0, v) / yMax) * (plotBottom - plotTop),
    ];

    // Setpoint reference (dashed)
    if (setpoints[strip.key] > 0) {
      const [, py] = toPx(tMin, setpoints[strip.key]);
      ctx.strokeStyle = palette.gridStroke;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(plotLeft, py);
      ctx.lineTo(plotRight, py);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Trace line
    ctx.strokeStyle = strip.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const s of history) {
      if (s.t < tMin) continue;
      const [px, py] = toPx(s.t, s[strip.key]);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // Label + current value
    const last = history[history.length - 1];
    ctx.fillStyle = palette.chartLabel;
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(strip.label, 4, plotTop);
    ctx.textAlign = "right";
    ctx.fillStyle = strip.color;
    ctx.fillText(last[strip.key].toFixed(2), margin.left - 6, plotTop);

    if (si > 0) {
      ctx.strokeStyle = palette.chartAxis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(width, top);
      ctx.stroke();
    }
  });
}
