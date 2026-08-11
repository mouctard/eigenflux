// Volume enclosed by a closed structured surface (nTheta x nZeta grid, zeta-major
// theta-minor ordering -- matches src/stellarator/loadSurfaces.js's format and
// src/stellarator/viewer.js's buildGeometry connectivity) via the divergence theorem:
// V = (1/6) |sum over triangles of v0 . (v1 x v2)|, decomposing each (i,j)-(i1,j)-(i1,j1)-
// (i,j1) quad into the same two triangles the 3D viewer already renders. The absolute value
// is safe because a structured (i,j) grid on a topological torus is automatically a
// consistently-wound closed 2-manifold -- the sum's sign just depends on which way the
// existing connectivity happens to wind, not on any assumption being made here.
//
// Verified in tools/validate_stellarator_volume.mjs against a synthetic circular torus of
// known volume (2*pi^2*R0*a^2), using this exact grid format/connectivity.
function triVol6(X, Y, Z, a, b, c) {
  const ax = X[a], ay = Y[a], az = Z[a];
  const bx = X[b], by = Y[b], bz = Z[b];
  const cx = X[c], cy = Y[c], cz = Z[c];
  return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
}

export function computeSurfaceVolume({ X, Y, Z }, nTheta, nZeta) {
  const idx = (i, j) => j * nTheta + i;
  let sixV = 0;
  for (let j = 0; j < nZeta; j++) {
    const j1 = (j + 1) % nZeta;
    for (let i = 0; i < nTheta; i++) {
      const i1 = (i + 1) % nTheta;
      const a = idx(i, j), b = idx(i1, j), c = idx(i1, j1), d = idx(i, j1);
      sixV += triVol6(X, Y, Z, a, b, c) + triVol6(X, Y, Z, a, c, d);
    }
  }
  return Math.abs(sixV / 6);
}
