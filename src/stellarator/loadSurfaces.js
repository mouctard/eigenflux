// Parse the custom binary format written by tools/export_stellarators.py:
//   int32 nSurfaces, nTheta, nZeta, NFP
//   per surface: float32[nZeta*nTheta] X, Y, Z   (zeta-major, theta-minor)
export async function loadSurfaces(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);

  const nSurfaces = dv.getInt32(0, true);
  const nTheta = dv.getInt32(4, true);
  const nZeta = dv.getInt32(8, true);
  const NFP = dv.getInt32(12, true);

  const pointsPerSurface = nTheta * nZeta;
  let offset = 16;
  const surfaces = [];
  for (let s = 0; s < nSurfaces; s++) {
    const X = new Float32Array(buf, offset, pointsPerSurface);
    offset += pointsPerSurface * 4;
    const Y = new Float32Array(buf, offset, pointsPerSurface);
    offset += pointsPerSurface * 4;
    const Z = new Float32Array(buf, offset, pointsPerSurface);
    offset += pointsPerSurface * 4;
    surfaces.push({ X, Y, Z });
  }

  return { nSurfaces, nTheta, nZeta, NFP, surfaces };
}
