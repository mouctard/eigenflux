// Miller/Turnbull parametrization of a tokamak poloidal cross-section boundary,
// standard in fixed-boundary equilibrium codes.
//
//   R(theta) = R0 + a * cos(theta + delta * sin(theta))
//   Z(theta) = kappa * a * sin(theta)
//
// R0/a = major/minor radius, kappa = elongation, delta = triangularity.

export const SHAPE_PRESETS = {
  circular: { label: "Circular", R0: 3.0, a: 1.0, kappa: 1.0, delta: 0.0 },
  iterLike: { label: "ITER-like", R0: 3.1, a: 1.0, kappa: 1.7, delta: 0.33 },
  sphericalTokamak: { label: "Spherical tokamak", R0: 1.6, a: 1.0, kappa: 2.0, delta: 0.4 },
};

export function boundaryPoint(shape, theta) {
  const { R0, a, kappa, delta } = shape;
  const R = R0 + a * Math.cos(theta + delta * Math.sin(theta));
  const Z = kappa * a * Math.sin(theta);
  return [R, Z];
}

export function sampleBoundary(shape, nPoints) {
  const pts = [];
  for (let k = 0; k < nPoints; k++) {
    pts.push(boundaryPoint(shape, (2 * Math.PI * k) / nPoints));
  }
  return pts;
}

// Custom equation-based boundary: r(theta) is a user-supplied radial function (see
// src/math/exprParser.js), interpreted as a polar offset from a fixed center (R0, 0) --
// R(theta) = R0 + r(theta)*cos(theta), Z(theta) = r(theta)*sin(theta). Star-shaped around
// the center by construction (one radius per angle), which is exactly what
// buildOGridMeshFromBoundary (src/geom/mesh.js) needs.
export const CUSTOM_R0 = 3.0; // same major radius as the circular preset

export function customBoundaryPoint(R0, rFn, theta) {
  const r = rFn(theta);
  return [R0 + r * Math.cos(theta), r * Math.sin(theta)];
}

// Rejects r(theta) that would produce a degenerate or self-intersecting mesh: non-finite, or
// too close to/through the center (which the O-grid mesher's radial interpolation from
// (R0, 0) can't handle -- rays from the center to the boundary would have near-zero length or
// cross each other for r <= 0). Returns { ok: true } or { ok: false, reason }.
export function validateCustomBoundary(rFn, { nSamples = 256, minR = 0.05 } = {}) {
  for (let i = 0; i < nSamples; i++) {
    const theta = (2 * Math.PI * i) / nSamples;
    let r;
    try {
      r = rFn(theta);
    } catch (e) {
      return { ok: false, reason: `r(theta) failed to evaluate at theta=${theta.toFixed(2)}: ${e.message}` };
    }
    if (!Number.isFinite(r)) {
      return { ok: false, reason: `r(theta) is not finite at theta=${theta.toFixed(2)} (got ${r})` };
    }
    if (r < minR) {
      return {
        ok: false,
        reason: `r(theta) must stay >= ${minR} everywhere (got ${r.toFixed(3)} at theta=${theta.toFixed(2)})`,
      };
    }
  }
  return { ok: true };
}
