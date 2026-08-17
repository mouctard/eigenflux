// Per-wall-node outward normal and "represented length" (half the sum of the two adjacent
// wall-ring edge lengths), used by sheath.js's Robin terms to turn a physical flux
// (particles or watts per m^2, or per m for this page's 2D poloidal-plane treatment -- see
// equations.js's module doc) into a boundary-integral contribution to a 2D FEM equation
// (a standard length-integral, dA for bulk terms vs ds for boundary terms -- not an extra
// approximation on top of that, just what a 2D boundary integral actually is).
import { outwardNormal } from "./sheath.js";

export function computeWallSegments(mesh, centerR) {
  const ring = mesh.boundaryNodes; // ordered around the wall, cyclic (see src/geom/mesh.js)
  const n = ring.length;
  const segments = new Map(); // nodeIdx -> { normal: [nx,nz], halfLength }

  for (let i = 0; i < n; i++) {
    const idx = ring[i];
    const prev = mesh.nodes[ring[(i - 1 + n) % n]];
    const next = mesh.nodes[ring[(i + 1) % n]];
    const [R, Z] = mesh.nodes[idx];
    const normal = outwardNormal(centerR, R, Z, prev, next);
    const dPrev = Math.hypot(R - prev[0], Z - prev[1]);
    const dNext = Math.hypot(next[0] - R, next[1] - Z);
    segments.set(idx, { normal, halfLength: (dPrev + dNext) / 2 });
  }
  return segments;
}
