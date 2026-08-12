// Canvas rendering: temperature colormap (flat-shaded triangles) + flux-surface contours +
// boundary outline + magnetic-axis marker.
import { contoursForLevels } from "./contour.js";
import { colormap, colormapRGB } from "./colormap.js";
import { getCanvasPalette } from "./theme.js";

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

// glow is always a plain object now (never null) -- powerLevel is 0 when there's no active
// reaction, which zeroes the throb term below naturally, so callers never need a null check.
export function renderEquilibrium(ctx, canvas, mesh, psi, pressureField, psiAxis, opts = {}) {
  const { showMesh = false, glow = { powerLevel: 0, throb: 1 }, fuelFrac = 1, ignitionFrac = 1 } = opts;
  const { width, height } = canvas;
  const toPx = fitTransform(mesh, width, height);
  const palette = getCanvasPalette();

  ctx.fillStyle = palette.canvasBg;
  ctx.fillRect(0, 0, width, height);

  // Ignition gate: before Play (and while ramping back down after Reset), there's no
  // energized confining field and no hot plasma to see, so the fill lerps from the page
  // background up to the full temperature colormap as `ignitionFrac` (the same 1.4s-up/
  // 1.1s-down ramp already driving the Bt/Ip/heating diagnostics in main.js) rises -- the
  // chamber is dark until the field is actually on, same as it would be for real.
  const ig = Math.max(0, Math.min(1, ignitionFrac));
  const bgRGB = hexToRgb(palette.canvasBg);

  // Sawtooth "throb": glow.throb is the real, asymmetric core-temperature relaxation
  // envelope (slow reheat, fast crash -- see src/fusion/sawtooth.js for the physics and
  // citations, not a sin() oscillation), in [1-crashDepth, 1]. It modulates how far past the
  // steady-state profile the core brightens, weighted toward the core (t close to 1, where
  // the reaction actually happens) so the edge stays a stable read on temperature. Because
  // this only ever recolors triangles that are already part of the solved plasma mesh (no
  // separate shape drawn on top), it's geometrically incapable of extending past the last
  // closed flux surface, for any boundary shape.
  const level = Math.max(0, Math.min(1, glow.powerLevel));
  const throbBoost = ig * level * Math.max(0, Math.min(1, glow.throb));
  const [hotR, hotG, hotB] = colormapRGB(1); // white-hot end of the colormap

  const maxP = pressureField(0);
  for (const tri of mesh.triangles) {
    const psiC = (psi[tri[0]] + psi[tri[1]] + psi[tri[2]]) / 3;
    const psiN = psiAxis > 0 ? 1 - psiC / psiAxis : 1;
    const clamped = Math.max(0, Math.min(1, psiN));
    // Temperature-shape proxy: the solved profile p(psiN) reused as a normalized temperature
    // shape T(psiN)/T0, valid under this page's flat-density assumption (pressure = n*T with
    // n treated as spatially uniform -- the same simplification the burn model already makes
    // everywhere else, since its n0_m3 is a single scalar, not a profile). See "Units" in the
    // how-it-works panel.
    const t = maxP > 0 ? pressureField(clamped) / maxP : 0;

    const [p0, p1, p2] = tri.map((i) => toPx(mesh.nodes[i]));
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();

    const [cr, cg, cb] = colormapRGB(t);
    // Base: lerp background -> full temperature color by ignition fraction.
    let r = bgRGB[0] + (cr - bgRGB[0]) * ig;
    let g = bgRGB[1] + (cg - bgRGB[1]) * ig;
    let b = bgRGB[2] + (cb - bgRGB[2]) * ig;
    // Core throb: blend further toward white-hot, core-weighted, tracking the sawtooth
    // envelope directly -- brightest right before a crash, dimmer just after, so the
    // highlight itself lives through the real relaxation cycle instead of a constant boost.
    if (throbBoost > 0) {
      const mix = throbBoost * t * t * 0.55;
      r += (hotR - r) * mix;
      g += (hotG - g) * mix;
      b += (hotB - b) * mix;
    }
    ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    ctx.fill();

    if (showMesh) {
      ctx.strokeStyle = palette.gridStroke;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Fuel-depletion cue: wash the fill toward the page background as fuel runs out, so a spent
  // plasma visibly fades rather than looking identical to a full one. This is a presentation
  // cue tied to the burn model's n(t)/n0, not a re-solved equilibrium -- the Grad-Shafranov
  // shape itself stays the one already-solved static solve (see "Live fuel burn" in the
  // how-it-works panel). Drawn before contours/boundary so those stay crisp.
  const frac = Math.max(0, Math.min(1, fuelFrac));
  if (frac < 1) {
    ctx.fillStyle = hexToRgba(palette.canvasBg, (1 - frac) * 0.88);
    ctx.fillRect(0, 0, width, height);
  }

  let axisIdx = 0;
  for (let i = 1; i < psi.length; i++) if (psi[i] > psi[axisIdx]) axisIdx = i;
  const [ax, ay] = toPx(mesh.nodes[axisIdx]);

  const nLevels = 12;
  const levels = [];
  for (let k = 1; k <= nLevels; k++) levels.push((psiAxis * k) / (nLevels + 1));
  const contourMap = contoursForLevels(mesh, psi, levels);

  ctx.strokeStyle = palette.gridLine;
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

  ctx.strokeStyle = palette.boundaryLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  mesh.boundaryNodes.forEach((idx, k) => {
    const [x, y] = toPx(mesh.nodes[idx]);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = palette.axisMarker;
  ctx.beginPath();
  ctx.arc(ax, ay, 3, 0, 2 * Math.PI);
  ctx.fill();
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexToRgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}
