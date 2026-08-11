// Closed-form 0D D-T burn model. No refueling ("deplete") has an exact analytic solution
// for dn/dt = -sigmaV*n^2 with equal initial D/T density; "sustained" (refueling exactly
// matches consumption) is trivially constant. Both verified against a small-step Euler
// integration before use (agreement to 1 part in 1e6) -- see the plan notes. Because these
// are closed forms, every quantity is evaluated directly from elapsed time; there's no
// per-frame integration step to accumulate error or go unstable.
import { sigmaV } from "./reactivity.js";
import { E_DT_JOULES } from "./presets.js";

// Plasma volume via Pappus's theorem, one term per mesh triangle: revolving a 2D area
// element at centroid radius Rc through 2*pi gives 2*pi*Rc*area. Treats mesh (R, Z) as
// meters.
export function computeVolume(mesh) {
  let V = 0;
  for (const tri of mesh.triangles) {
    const [R1, Z1] = mesh.nodes[tri[0]];
    const [R2, Z2] = mesh.nodes[tri[1]];
    const [R3, Z3] = mesh.nodes[tri[2]];
    const area = Math.abs((R2 - R1) * (Z3 - Z1) - (R3 - R1) * (Z2 - Z1)) / 2;
    const Rc = (R1 + R2 + R3) / 3;
    V += 2 * Math.PI * Rc * area;
  }
  return V;
}

export function createBurnModel({ T_keV, n0_m3, volume_m3 }) {
  const sv = sigmaV(T_keV);
  const P0 = n0_m3 * n0_m3 * sv * volume_m3 * E_DT_JOULES;

  function deplete(t) {
    const n = n0_m3 / (1 + n0_m3 * sv * t);
    const P = n * n * sv * volume_m3 * E_DT_JOULES;
    const E = (volume_m3 * E_DT_JOULES * sv * (n0_m3 * n0_m3 * t)) / (1 + n0_m3 * sv * t);
    return { n, P, E };
  }

  function sustained(t) {
    return { n: n0_m3, P: P0, E: P0 * t };
  }

  return {
    sv,
    P0,
    n0_m3,
    volume_m3,
    at(t, mode) {
      return mode === "sustained" ? sustained(t) : deplete(t);
    },
  };
}
