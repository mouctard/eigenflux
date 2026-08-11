// Canvas rendering: pressure colormap (flat-shaded triangles) + flux-surface contours +
// boundary outline + magnetic-axis marker.
import { contoursForLevels } from "./contour.js";

// Small hand-rolled "plasma"-style colormap (dark purple -> magenta -> orange -> pale
// yellow) -- thematically apt for a pressure field, reasonably perceptually ordered,
// no external palette dependency.
const STOPS = [
  [13, 8, 61],
  [84, 15, 109],
  [153, 40, 105],
  [217, 74, 78],
  [252, 141, 44],
  [252, 220, 76],
];

function colormap(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = STOPS[i], b = STOPS[i + 1];
  const r = Math.round(a[0] + f * (b[0] - a[0]));
  const g = Math.round(a[1] + f * (b[1] - a[1]));
  const bch = Math.round(a[2] + f * (b[2] - a[2]));
  return `rgb(${r},${g},${bch})`;
}

function fitTransform(mesh, width, height, marginFrac = 0.08) {
  let minR = Infinity, maxR = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [R, Z] of mesh.nodes) {
    if (R < minR) minR = R;
    if (R > maxR) maxR = R;
    if (Z < minZ) minZ = Z;
    if (Z > maxZ) maxZ = Z;
  }
  const padR = (maxR - minR) * marginFrac;
  const padZ = (maxZ - minZ) * marginFrac;
  minR -= padR; maxR += padR; minZ -= padZ; maxZ += padZ;

  const scale = Math.min(width / (maxR - minR), height / (maxZ - minZ));
  const offX = (width - (maxR - minR) * scale) / 2;
  const offY = (height - (maxZ - minZ) * scale) / 2;

  return ([R, Z]) => [offX + (R - minR) * scale, height - (offY + (Z - minZ) * scale)];
}

export function renderEquilibrium(ctx, canvas, mesh, psi, pressureField, psiAxis) {
  const { width, height } = canvas;
  const toPx = fitTransform(mesh, width, height);

  ctx.fillStyle = "#fafaf8";
  ctx.fillRect(0, 0, width, height);

  const maxP = pressureField(0);
  for (const tri of mesh.triangles) {
    const psiC = (psi[tri[0]] + psi[tri[1]] + psi[tri[2]]) / 3;
    const psiN = psiAxis > 0 ? 1 - psiC / psiAxis : 1;
    const clamped = Math.max(0, Math.min(1, psiN));
    const t = maxP > 0 ? pressureField(clamped) / maxP : 0;

    const [p0, p1, p2] = tri.map((i) => toPx(mesh.nodes[i]));
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fillStyle = colormap(t);
    ctx.fill();
  }

  const nLevels = 12;
  const levels = [];
  for (let k = 1; k <= nLevels; k++) levels.push((psiAxis * k) / (nLevels + 1));
  const contourMap = contoursForLevels(mesh, psi, levels);

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  for (const segments of contourMap.values()) {
    for (const [a, b] of segments) {
      const pa = toPx(a), pb = toPx(b);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  mesh.boundaryNodes.forEach((idx, k) => {
    const [x, y] = toPx(mesh.nodes[idx]);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  let axisIdx = 0;
  for (let i = 1; i < psi.length; i++) if (psi[i] > psi[axisIdx]) axisIdx = i;
  const [ax, ay] = toPx(mesh.nodes[axisIdx]);
  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(ax, ay, 3, 0, 2 * Math.PI);
  ctx.fill();
}
