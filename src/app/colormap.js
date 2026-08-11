// Small hand-rolled "plasma"-style colormap (dark purple -> magenta -> orange -> pale
// yellow) -- thematically apt for a pressure field, reasonably perceptually ordered, no
// external palette dependency. Shared between the 2D tokamak renderer and the 3D
// stellarator viewer.
const STOPS = [
  [13, 8, 61],
  [84, 15, 109],
  [153, 40, 105],
  [217, 74, 78],
  [252, 141, 44],
  [252, 220, 76],
];

export function colormapRGB(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = STOPS[i], b = STOPS[i + 1];
  return [
    Math.round(a[0] + f * (b[0] - a[0])),
    Math.round(a[1] + f * (b[1] - a[1])),
    Math.round(a[2] + f * (b[2] - a[2])),
  ];
}

export function colormap(t) {
  const [r, g, b] = colormapRGB(t);
  return `rgb(${r},${g},${b})`;
}
