// 2D colormap render of a nodal scalar field (n, T_i, or T_e) on the Braginskii mesh,
// reusing the same flat-shaded-triangle approach and colormap as src/app/render.js.
import { colormapRGB } from "../app/colormap.js";

function fitTransform(nodes, width, height, marginFrac = 0.05) {
  let minR = Infinity, maxR = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [R, Z] of nodes) {
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

export function renderField(ctx, canvas, mesh, field, opts = {}) {
  const { width, height } = canvas;
  const { bgColor = "#0b0e14", showMesh = false, min: fixedMin, max: fixedMax } = opts;
  const toPx = fitTransform(mesh.nodes, width, height);

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  let min = fixedMin, max = fixedMax;
  if (min === undefined || max === undefined) {
    min = Infinity; max = -Infinity;
    for (const v of field) { if (v < min) min = v; if (v > max) max = v; }
    if (max - min < 1e-12) { min -= 1; max += 1; }
  }

  for (const tri of mesh.triangles) {
    const vAvg = (field[tri[0]] + field[tri[1]] + field[tri[2]]) / 3;
    const t = (vAvg - min) / (max - min);
    const [p0, p1, p2] = tri.map((i) => toPx(mesh.nodes[i]));
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    const [r, g, b] = colormapRGB(t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    if (showMesh) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "#e8e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  mesh.boundaryNodes.forEach((idx, k) => {
    const [x, y] = toPx(mesh.nodes[idx]);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  return { min, max };
}
