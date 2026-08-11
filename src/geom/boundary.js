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
