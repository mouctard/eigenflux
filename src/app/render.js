// Canvas rendering: pressure colormap (flat-shaded triangles) + flux-surface contours +
// boundary outline + magnetic-axis marker.
import { contoursForLevels } from "./contour.js";
import { colormap, colormapRGB } from "./colormap.js";

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

export function renderEquilibrium(ctx, canvas, mesh, psi, pressureField, psiAxis, opts = {}) {
  const { showMesh = false, glow = null, fuelFrac = 1 } = opts;
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

    if (showMesh) {
      ctx.strokeStyle = "rgba(20,20,20,0.35)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Fuel-depletion cue: wash the pressure fill toward the page background as fuel runs out,
  // so a spent plasma visibly fades rather than looking identical to a full one. This is a
  // presentation cue tied to the burn model's n(t)/n0, not a re-solved equilibrium -- the
  // Grad-Shafranov shape itself stays the one already-solved static solve (see "Live fuel
  // burn" in the how-it-works panel). Drawn before contours/boundary so those stay crisp.
  const frac = Math.max(0, Math.min(1, fuelFrac));
  if (frac < 1) {
    ctx.fillStyle = `rgba(250, 250, 248, ${((1 - frac) * 0.88).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }

  let axisIdx = 0;
  for (let i = 1; i < psi.length; i++) if (psi[i] > psi[axisIdx]) axisIdx = i;
  const [ax, ay] = toPx(mesh.nodes[axisIdx]);

  if (glow) drawGlow(ctx, width, height, ax, ay, glow);

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

  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(ax, ay, 3, 0, 2 * Math.PI);
  ctx.fill();
}

// Soft "hot core" glow, centered on the magnetic axis, modulated by the current fusion
// power level (0..1, normalized to initial power) and a slow pulse -- the reaction-rate
// visual tie-in. Drawn under the contour lines so it reads as a glow, not an occlusion.
function drawGlow(ctx, width, height, cx, cy, { powerLevel, pulsePhase }) {
  const level = Math.max(0, Math.min(1, powerLevel));
  const pulse = 0.7 + 0.3 * Math.sin(pulsePhase);
  // Sized to extend past the already-bright core into the darker mid-radius flux
  // surfaces, where a screen-blended warm glow actually reads as animated -- blending
  // more warm-on-warm at the core center barely changes anything visually.
  const radius = Math.min(width, height) * (0.32 + 0.34 * level) * pulse;
  const alpha = 0.22 + 0.4 * level * pulse;

  const [hotR, hotG, hotB] = colormapRGB(1); // bright yellow, the colormap's hot end
  const [midR, midG, midB] = colormapRGB(0.85); // yellow-orange

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(radius, 1));
  gradient.addColorStop(0, `rgba(${hotR}, ${hotG}, ${hotB}, ${alpha})`);
  gradient.addColorStop(0.4, `rgba(${midR}, ${midG}, ${midB}, ${alpha * 0.7})`);
  gradient.addColorStop(1, `rgba(${midR}, ${midG}, ${midB}, 0)`);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(radius, 1), 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}
