// Closed-form 0D burn model, generalized across fuel cycles (src/fusion/fuels.js).
//
// "Deplete" (no refueling) has an exact analytic solution for dn/dt = -pairFactor * n^2 *
// effectiveSigmaV; "sustained" (refueling exactly matches consumption) is trivially constant.
// The original D-T-only version of this file verified the deplete closed form against a
// small-step Euler integration (agreement to 1 part in 1e6) -- see the plan notes. Because
// these are closed forms, every quantity is evaluated directly from elapsed time; there's no
// per-frame integration step to accumulate error or go unstable.
//
// Generalization note (why the same n(t) works for every fuel, not just D-T): for a
// cross-species reaction (D-T, D-3He) with n = n_D = n_other assumed equal, each reaction
// consumes one of each, so dn/dt = -R where R = pairFactor(=1) * n^2 * effectiveSigmaV, i.e.
// dn/dt = -n^2*effectiveSigmaV. For a self-reaction (D-D) with n = n_D, each reaction consumes
// *two* D, so dn/dt = -2R where R = pairFactor(=0.5) * n^2 * effectiveSigmaV -- the factor of
// 2 exactly cancels the 0.5, giving dn/dt = -n^2*effectiveSigmaV again. Both cases reduce to
// the same n(t) = n0/(1+n0*effectiveSigmaV*t) used below; only the power/energy formulas
// (which don't get this cancellation, since Q differs by branch) need pairFactor explicitly.
// tools/validate_reactivity.mjs's D-T check confirms this refactor reproduces the original
// numbers exactly when fuel=dt (pairFactor=1, one branch).
import { resolveFuel } from "./fuels.js";

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

export function createBurnModel({ fuel, T_keV, n0_m3, volume_m3 }) {
  const { pairFactor, effectiveSigmaV, effectiveSigmaVQ_J, avgQ_J, neutronFrac, chargedFrac } = resolveFuel(fuel, T_keV);
  const P0 = pairFactor * n0_m3 * n0_m3 * effectiveSigmaVQ_J * volume_m3;

  function deplete(t) {
    const n = n0_m3 / (1 + n0_m3 * effectiveSigmaV * t);
    const P = pairFactor * n * n * effectiveSigmaVQ_J * volume_m3;
    const E = (pairFactor * volume_m3 * effectiveSigmaVQ_J * (n0_m3 * n0_m3 * t)) / (1 + n0_m3 * effectiveSigmaV * t);
    return { n, P, E };
  }

  function sustained(t) {
    return { n: n0_m3, P: P0, E: P0 * t };
  }

  // Asymptotic total energy a full deplete burn eventually releases as t -> infinity (the
  // closed form's own limit: E(t) = k*t/(1+a*t) -> k/a as t -> infinity, with k = pairFactor*
  // V*effectiveSigmaVQ_J*n0^2 and a = n0*effectiveSigmaV). Finite because the fuel runs out;
  // sustained mode has no such limit (linear in t) since it's continuously refueled.
  const E_total_deplete = effectiveSigmaV > 0 ? pairFactor * volume_m3 * effectiveSigmaVQ_J * (n0_m3 / effectiveSigmaV) : 0;

  return {
    effectiveSigmaV,
    effectiveSigmaVQ_J,
    avgQ_J,
    P0,
    n0_m3,
    volume_m3,
    neutronFrac,
    chargedFrac,
    pairFactor,
    E_total_deplete,
    at(t, mode) {
      return mode === "sustained" ? sustained(t) : deplete(t);
    },
  };
}

// Time (s) at which cumulative energy E(t) first reaches targetJ, for the given mode -- the
// inverse of createBurnModel's E(t). Returns null if unreachable (deplete mode, target above
// E_total_deplete) or if targetJ <= 0.
//
// Sustained: E(t) = P0*t (linear)                         -> t = targetJ / P0
// Deplete:   E(t) = k*t/(1+a*t), k = P0 (since P(0)=k/(1)), a = n0*effectiveSigmaV
//            k*t/(1+a*t) = targetJ  =>  t = targetJ / (k - targetJ*a), valid for
//            targetJ < k/a = E_total_deplete (else the denominator is <= 0)
export function timeToEnergy(burnModel, mode, targetJ) {
  if (!(targetJ > 0)) return null;
  if (mode === "sustained") {
    return burnModel.P0 > 0 ? targetJ / burnModel.P0 : null;
  }
  const k = burnModel.P0;
  const a = burnModel.n0_m3 * burnModel.effectiveSigmaV;
  if (!(k > 0) || targetJ >= burnModel.E_total_deplete) return null;
  const denom = k - targetJ * a;
  return denom > 0 ? targetJ / denom : null;
}
