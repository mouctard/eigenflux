// Mesh/field-derived tokamak diagnostics, computed directly from an already-solved psi field --
// no calibration to real units needed for these, unlike the profile amplitudes themselves
// (see index.html's "Units" panel). Sits next to equilibrium.js/assemble.js since both
// quantities here are pure functions of (mesh, psi).
import { triGeometry } from "./assemble.js";

// Internal inductance li = <Bp^2>_volume / Bp^2(a) (Wesson, "Tokamaks"; Freidberg, "Ideal MHD").
// Bp = |grad psi| / R (P1 elements give a constant grad psi per triangle -- the same b/c
// shape-function coefficients assembleStiffness already uses for the stiffness term, reused
// here via triGeometry). Since Bp is proportional to grad(psi) everywhere, li is *invariant*
// to psi's overall (arbitrary) scale -- both the numerator and denominator scale by the same
// factor squared and it cancels, so this is genuinely computable from the solver's own
// arbitrary-unit solve, no real-Tesla calibration required.
//
// The volume average uses the same toroidal (Pappus) weight 2*pi*Rc*area per triangle as
// computeVolume (src/fusion/burn.js); the edge value Bp^2(a) is the plain mean of Bp^2 over
// triangles that have at least two vertices on the boundary (i.e. share a boundary edge) --
// a P1-consistent approximation to a true boundary line-average, reasonable given the O-grid
// mesh's fairly uniform theta-spacing at the outer ring.
export function computeInternalInductance(mesh, psi) {
  const boundarySet = new Set(mesh.boundaryNodes);

  let volNumerator = 0; // sum of Bp^2 * dV
  let totalVolume = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (const tri of mesh.triangles) {
    const { area, b, c, Rc } = triGeometry(mesh.nodes, tri);
    if (area < 1e-14 || Rc <= 0) continue;

    const gradR = psi[tri[0]] * b[0] + psi[tri[1]] * b[1] + psi[tri[2]] * b[2];
    const gradZ = psi[tri[0]] * c[0] + psi[tri[1]] * c[1] + psi[tri[2]] * c[2];
    const twoAreaSigned = 2 * area; // sign doesn't matter -- only |grad psi|^2 is used below
    const gradMagSq = (gradR * gradR + gradZ * gradZ) / (twoAreaSigned * twoAreaSigned);
    const bpSq = gradMagSq / (Rc * Rc);

    const dV = 2 * Math.PI * Rc * area;
    volNumerator += bpSq * dV;
    totalVolume += dV;

    let nBoundaryVerts = 0;
    for (const idx of tri) if (boundarySet.has(idx)) nBoundaryVerts++;
    if (nBoundaryVerts >= 2) {
      edgeSum += bpSq;
      edgeCount++;
    }
  }

  if (totalVolume <= 0 || edgeCount === 0) return null;
  const bpSqVolAvg = volNumerator / totalVolume;
  const bpSqEdge = edgeSum / edgeCount;
  return bpSqEdge > 0 ? bpSqVolAvg / bpSqEdge : null;
}

// Plasma boundary surface area (m^2), via Pappus's theorem applied to the boundary polyline
// (the same technique computeVolume applies to triangles): each boundary edge sweeps an
// annular band of area 2*pi*Rc_edge*length_edge when revolved around the Z axis. Needed for
// the Martin08 L-H threshold scaling (src/fusion/diagnostics.js), which is a function of
// plasma surface area.
export function computeBoundarySurfaceArea(mesh) {
  const nodes = mesh.boundaryNodes;
  let S = 0;
  for (let i = 0; i < nodes.length; i++) {
    const [R1, Z1] = mesh.nodes[nodes[i]];
    const [R2, Z2] = mesh.nodes[nodes[(i + 1) % nodes.length]];
    const length = Math.hypot(R2 - R1, Z2 - Z1);
    const Rc = (R1 + R2) / 2;
    S += 2 * Math.PI * Rc * length;
  }
  return S;
}
