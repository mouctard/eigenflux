// Jacobi-preconditioned Conjugate Gradient for symmetric positive-definite systems A x = b.
//
// The Grad-Shafranov stiffness matrix is reassembled once per mesh (it doesn't depend on
// psi) and reused across every Picard iteration, so a direct factorization isn't needed:
// warm-starting CG from the previous iterate converges in a handful of iterations after
// the first solve.

export function pcg(A, b, { x0, tol = 1e-10, maxIter = 1000, diag } = {}) {
  const n = A.n;
  const d = diag || A.diagonal();
  const x = x0 ? Float64Array.from(x0) : new Float64Array(n);

  const r = new Float64Array(n);
  const Ax0 = A.matvec(x);
  for (let i = 0; i < n; i++) r[i] = b[i] - Ax0[i];

  const z = new Float64Array(n);
  const applyPrecond = () => {
    for (let i = 0; i < n; i++) z[i] = r[i] / d[i];
  };
  applyPrecond();

  const p = Float64Array.from(z);
  let rz = dot(r, z);
  const bnorm = Math.sqrt(dot(b, b)) || 1;

  let iter = 0;
  for (; iter < maxIter; iter++) {
    const rnorm = Math.sqrt(dot(r, r));
    if (rnorm / bnorm < tol) break;

    const Ap = A.matvec(p);
    const alpha = rz / dot(p, Ap);
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }
    applyPrecond();
    const rzNew = dot(r, z);
    const beta = rzNew / rz;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    rz = rzNew;
  }

  return { x, iterations: iter };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
