// Closed-form Solov'ev equilibrium -- the validation target for the FEM solver, playing
// the role eigendrum's Bessel-function/rectangle validation plays there.
//
// Restricted to the case where p'(psi) and FF'(psi) are both constant, which makes the
// weak-form source f(R,Z) = A*R + B/R (equivalently, the strong form is
// Delta* psi = -(A R^2 + B), the classic Solov'ev source), and to up-down symmetric
// (delta = 0) boundaries.
//
// Verified symbolically: for any c1, c2, c3, the ansatz
//   psi = c1 + c2*R^2 + c3*(R^4 - 4 R^2 Z^2) + (C1/8) R^4 + (C2/2) Z^2      [C1=-A, C2=-B]
// satisfies Delta* psi = C1 R^2 + C2 identically -- the first three terms are homogeneous
// solutions of Delta* (this is the standard elongated-plasma Solov'ev construction, see
// Freidberg, "Ideal Magnetohydrodynamics"). c1, c2, c3 are the unique values that also
// zero psi at the outboard midplane, inboard midplane, and top boundary points.

export function solovevSource(A, B) {
  return (R) => A * R + B / R;
}

export function solovevSolution({ R0, a, kappa }, A, B) {
  const C1 = -A;
  const C2 = -B;
  const denom = 4 * R0 * R0 * kappa * kappa + 4 * R0 * R0 - a * a;

  const c1 =
    (kappa * kappa *
      (-A * R0 ** 6 + 2 * A * R0 ** 4 * a * a - A * R0 * R0 * a ** 4 -
        B * R0 ** 4 + 2 * B * R0 * R0 * a * a - B * a ** 4)) /
    (2 * denom);

  const c2 =
    (kappa * kappa * (A * R0 ** 4 + A * R0 * R0 * a * a + B * R0 * R0 + B * a * a)) /
    denom;

  const c3 = (4 * A * R0 * R0 - A * a * a - 4 * B * kappa * kappa) / (8 * denom);

  return (R, Z) =>
    c1 + c2 * R * R + c3 * (R ** 4 - 4 * R * R * Z * Z) + (C1 / 8) * R ** 4 + (C2 / 2) * Z * Z;
}

// The 3-point match above only forces psi=0 at the outboard/inboard/top points -- the
// true zero-contour elsewhere is close to, but not identical to, the Miller ellipse (this
// is the standard behavior of the classical Solov'ev construction: it produces an
// "approximately elliptical" boundary, not an exact one). For a mesh that's consistent
// with the analytic solution everywhere on its boundary (needed for a real convergence
// test), trace the solution's actual zero-contour by bisection along rays from the center.
export function solovevZeroContour(shape, A, B) {
  const psi = solovevSolution(shape, A, B);
  const psiAxis = psi(shape.R0, 0);
  const sign0 = Math.sign(psiAxis);
  const rhoGuess = Math.max(shape.a, shape.kappa * shape.a);

  return (theta) => {
    const dx = Math.cos(theta), dy = Math.sin(theta);
    let lo = 0;
    let hi = 3 * rhoGuess;
    let fHi = psi(shape.R0 + hi * dx, hi * dy);
    let guard = 0;
    while (Math.sign(fHi) === sign0 && guard < 50) {
      hi *= 1.5;
      fHi = psi(shape.R0 + hi * dx, hi * dy);
      guard++;
    }
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      const fMid = psi(shape.R0 + mid * dx, mid * dy);
      if (Math.sign(fMid) === sign0) lo = mid;
      else hi = mid;
    }
    const rho = 0.5 * (lo + hi);
    return [shape.R0 + rho * dx, rho * dy];
  };
}
