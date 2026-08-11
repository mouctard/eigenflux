// Marching-triangles contour extraction -- the unstructured-mesh analog of marching
// squares. For each triangle and each requested level, linearly interpolates along the
// (normally two) edges the level crosses. Segments are left disjoint rather than stitched
// into polylines: fine for direct canvas rendering, and much simpler.

function interp(pA, vA, pB, vB, level) {
  const t = (level - vA) / (vB - vA);
  return [pA[0] + t * (pB[0] - pA[0]), pA[1] + t * (pB[1] - pA[1])];
}

export function contoursForLevel(mesh, values, level) {
  const segments = [];

  for (const tri of mesh.triangles) {
    const v = [values[tri[0]], values[tri[1]], values[tri[2]]];
    const p = [mesh.nodes[tri[0]], mesh.nodes[tri[1]], mesh.nodes[tri[2]]];

    const min = Math.min(v[0], v[1], v[2]);
    const max = Math.max(v[0], v[1], v[2]);
    if (level < min || level > max) continue;

    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = e, b = (e + 1) % 3;
      const va = v[a], vb = v[b];
      if (va === vb) continue;
      if ((va <= level && vb >= level) || (va >= level && vb <= level)) {
        pts.push(interp(p[a], va, p[b], vb, level));
      }
    }
    if (pts.length >= 2) segments.push([pts[0], pts[1]]);
  }

  return segments;
}

export function contoursForLevels(mesh, values, levels) {
  const out = new Map();
  for (const level of levels) out.set(level, contoursForLevel(mesh, values, level));
  return out;
}
