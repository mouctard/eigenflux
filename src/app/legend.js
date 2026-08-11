// Paints a colormap legend bar's background from the actual colormap function, so the
// legend can never drift out of sync with what the canvas/3D view actually renders.
import { colormap } from "./colormap.js";

export function paintLegendBar(el, steps = 12) {
  const stops = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stops.push(`${colormap(t)} ${(t * 100).toFixed(1)}%`);
  }
  el.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
}
