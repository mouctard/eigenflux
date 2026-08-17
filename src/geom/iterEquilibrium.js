// Loads the real ITER baseline-scenario last-closed-flux-surface (LCFS) shape exported by
// tools/export_iter_equilibrium.py from SOLPS-ITER's own tutorial equilibrium (see that
// script's docstring and data/iter_equilibrium.json's "source" field for provenance), and
// rescales it into this app's arbitrary solver units so it can be drawn directly on top of
// the "ITER-like" Miller-parametrized boundary the solver actually uses.
//
// The app's mesh lives in arbitrary units (SHAPE_PRESETS.iterLike has R0=3.1, a=1.0 -- not
// real metres), so only the *shape* -- (R-R0)/a, (Z-Zmid)/a -- is meaningful to compare, not
// absolute position. This rescales the real metre-scale LCFS into that same dimensionless
// shape space, then back out into the app's units, so the overlay lines up with the solved
// boundary regardless of which arbitrary R0/a the app happens to use.
let cached = null;

export async function loadIterLcfsShape(dataUrl = "data/iter_equilibrium.json") {
  if (cached) return cached;
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`failed to load ${dataUrl}: ${res.status}`);
  const data = await res.json();

  const pts = data.lcfsPolyline_m;
  const Rs = pts.map((p) => p[0]);
  const Zs = pts.map((p) => p[1]);
  const R0 = data.lcfsShape.R0_m;
  const a = data.lcfsShape.a_m;
  const Zmid = 0.5 * (Math.max(...Zs) + Math.min(...Zs));

  // Dimensionless shape coordinates: u,v both O(1), matching how boundaryPoint() in
  // src/geom/boundary.js builds R = R0 + a*cos(...), Z = kappa*a*sin(...).
  const shape = pts.map(([R, Z]) => [(R - R0) / a, (Z - Zmid) / a]);

  cached = { shape, meta: data.lcfsShape, xPoint: data.xPoint, source: data.source };
  return cached;
}

// Rescale the dimensionless shape into a given app-unit preset (R0, a), producing an array
// of [R, Z] points directly comparable to mesh.nodes / boundaryPoint() output.
export function iterLcfsShapeInPresetUnits(shape, presetR0, presetA) {
  return shape.map(([u, v]) => [presetR0 + u * presetA, v * presetA]);
}
