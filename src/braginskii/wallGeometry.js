// Combines the real ITER divertor/inboard/top-of-machine wall arc (data/iter_equilibrium
// .json's wallArc -- see tools/export_iter_equilibrium.py for how that arc was picked out
// of the raw, non-single-polyline node list and verified before being trusted) with an
// illustrative outboard closing arc, into one star-shaped boundaryAt(theta) usable
// directly by buildOGridMeshFromBoundary (src/geom/mesh.js) -- same "R0 + rho*(Rb-R0),
// rho*Zb" contract the tokamak page's custom-equation boundary already uses, which is why
// the mesh center's Z must be exactly 0 (not the magnetic axis's real Z=0.59m) below.
//
// Real piece: 110 points, outer-divertor-leg -> divertor floor -> inboard wall -> over the
// top (roughly 190 degrees of the machine). Illustrative piece: the remaining ~170 degrees
// on the outboard side, a smooth radius blend from the real arc's own endpoints through a
// representative outboard extent (just past the real LCFS's own outboard radius) -- not
// digitized from any dataset. See index.html-equivalent "How this works" panel for this
// split stated the same way.

function angleFrom(centerR, point) {
  return Math.atan2(point[1], point[0] - centerR); // centerZ is always 0, see header note
}

// Continues each step in whichever direction keeps |delta| < pi, producing a monotonically
// changing (not mod-2pi) angle sequence -- the same unwinding used by hand to confirm this
// arc's winding during export.
function unwrapAngles(rawAngles) {
  const out = [rawAngles[0]];
  for (let i = 1; i < rawAngles.length; i++) {
    let d = rawAngles[i] - rawAngles[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    out.push(out[i - 1] + d);
  }
  return out;
}

// iterData is the parsed data/iter_equilibrium.json. Returns { centerR, boundaryAt }.
export function buildIterWallBoundary(iterData, { outboardStandoff_m = 0.15, nClose = 60 } = {}) {
  const centerR = iterData.magneticAxis.R_m;
  const realArc = iterData.wallArc.points_m; // [[R,Z], ...], real, verified (see module doc)

  const realAngles = unwrapAngles(realArc.map((p) => angleFrom(centerR, p)));
  const startPt = realArc[0];
  const endPt = realArc[realArc.length - 1];
  const startR = Math.hypot(startPt[0] - centerR, startPt[1]);
  const endR = Math.hypot(endPt[0] - centerR, endPt[1]);

  // Illustrative outboard target radius-from-center at the midplane, just past the real
  // LCFS's own outboard extent (a real number) plus a nominal SOL/wall standoff.
  const outboardR = iterData.lcfsShape.R0_m + iterData.lcfsShape.a_m - centerR + outboardStandoff_m;

  const a0 = realAngles[realAngles.length - 1]; // continue from the real arc's last angle
  const a1 = realAngles[0] - 2 * Math.PI; // back to the real arc's start, one full turn on

  const closeAngles = [];
  const closePts = [];
  for (let i = 1; i < nClose; i++) {
    const t = i / nClose;
    const theta = a0 + t * (a1 - a0);
    const w = 0.5 - 0.5 * Math.cos(Math.PI * t); // 0->1 smoothstep, seam-to-seam radius blend
    const seamBlend = endR + (startR - endR) * w;
    const bump = Math.sin(Math.PI * t); // 0 at both seams, 1 at the outboard midplane
    const r = seamBlend + (outboardR - seamBlend) * bump;
    closeAngles.push(theta);
    closePts.push([centerR + r * Math.cos(theta), r * Math.sin(theta)]);
  }

  // Explicit closing point at exactly a1 (the start point, one full turn on), so the
  // bracket search below actually wraps back to realArc[0] instead of stopping short at
  // the last interpolated closing-arc sample (which lands close to, but not exactly on,
  // the seam).
  const angles = realAngles.concat(closeAngles, [a1]);
  const pts = realArc.concat(closePts, [startPt]);

  function boundaryAt(theta) {
    let t = theta;
    while (t > angles[0]) t -= 2 * Math.PI;
    while (t < angles[angles.length - 1]) t += 2 * Math.PI;
    let i = 0;
    while (i < angles.length - 2 && angles[i + 1] > t) i++;
    const a = angles[i], b = angles[i + 1];
    const span = a - b;
    const frac = span > 1e-12 ? (a - t) / span : 0;
    const p0 = pts[i], p1 = pts[i + 1];
    return [p0[0] + (p1[0] - p0[0]) * frac, p0[1] + (p1[1] - p0[1]) * frac];
  }

  return { centerR, boundaryAt, realPointCount: realArc.length, totalPointCount: pts.length };
}
