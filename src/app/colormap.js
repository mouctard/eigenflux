// Hand-rolled "plasma"-style colormap: cool blue -> warm purple -> fiery magenta ->
// burning yellow. Multi-hue but still a valid *sequential* ramp, not a rainbow -- relative
// luminance increases monotonically stop to stop (0.041 -> 0.067 -> 0.116 -> 0.192 ->
// 0.579 -> 0.793), checked before use the same way the fuel-gauge categorical colors were
// checked with the dataviz skill's validator (that script targets categorical palettes;
// this is the equivalent manual check for a sequential one). Shared between the 2D tokamak
// renderer and the 3D stellarator viewer -- low t = cool/edge, high t = hot/core.
const STOPS = [
  [26, 47, 140], // #1a2f8c cool blue
  [91, 33, 182], // #5b21b6 warm purple
  [162, 28, 175], // #a21caf fiery magenta
  [225, 48, 108], // #e1306c fiery magenta-red
  [251, 191, 36], // #fbbf24 burning yellow-orange
  [253, 230, 138], // #fde68a bright yellow
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
