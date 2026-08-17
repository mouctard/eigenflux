"""Independent, from-scratch Python re-port of the Braginskii solve pipeline (wall
geometry, mesh build, background field, closures, anisotropic FEM assembly, implicit
timestep) -- built to numerically verify src/braginskii's actual formulas during
development, because this repo's dev sandbox has no JS runtime to run the real code
directly. This is NOT a substitute for tools/validate_braginskii_1d.mjs (which imports and
runs the real src/braginskii modules) -- it's a second, independently-written
implementation of the same math, kept here because it already earned its keep once: it's
what caught a real units bug in the sheath heat-flux terms (an extra, wrong division by
n and a missing division by EV_TO_J -- see the git history around
src/braginskii/sheath.js's ionHeatRobin, and that function's own comment) before this note
existed. If the real and ported implementations ever numerically disagree, that's worth
investigating even though this file isn't the source of truth.

Requires numpy (dense linear solves -- deliberately not the same sparse-CG code path as
production, so this stays an independent check). Run with:

    python3 tools/verify_pipeline.py
"""
import json
import math
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
D = json.load(open(REPO_ROOT / "data" / "iter_equilibrium.json"))


# ---------- src/braginskii/wallGeometry.js port ----------
def angle_from(centerR, p):
    return math.atan2(p[1], p[0] - centerR)


def unwrap(raw):
    out = [raw[0]]
    for i in range(1, len(raw)):
        d = raw[i] - raw[i - 1]
        while d > math.pi: d -= 2 * math.pi
        while d < -math.pi: d += 2 * math.pi
        out.append(out[-1] + d)
    return out


def build_iter_wall_boundary(data, outboard_standoff=0.15, n_close=60):
    centerR = data["magneticAxis"]["R_m"]
    real_arc = data["wallArc"]["points_m"]
    real_angles = unwrap([angle_from(centerR, p) for p in real_arc])
    start_pt, end_pt = real_arc[0], real_arc[-1]
    startR = math.hypot(start_pt[0] - centerR, start_pt[1])
    endR = math.hypot(end_pt[0] - centerR, end_pt[1])
    outboardR = data["lcfsShape"]["R0_m"] + data["lcfsShape"]["a_m"] - centerR + outboard_standoff
    a0 = real_angles[-1]
    a1 = real_angles[0] - 2 * math.pi
    close_angles, close_pts = [], []
    for i in range(1, n_close):
        t = i / n_close
        theta = a0 + t * (a1 - a0)
        w = 0.5 - 0.5 * math.cos(math.pi * t)
        seam = endR + (startR - endR) * w
        bump = math.sin(math.pi * t)
        r = seam + (outboardR - seam) * bump
        close_angles.append(theta)
        close_pts.append((centerR + r * math.cos(theta), r * math.sin(theta)))
    angles = real_angles + close_angles + [a1]
    pts = real_arc + close_pts + [start_pt]

    def boundary_at(theta):
        t = theta
        while t > angles[0]: t -= 2 * math.pi
        while t < angles[-1]: t += 2 * math.pi
        i = 0
        while i < len(angles) - 2 and angles[i + 1] > t:
            i += 1
        a, b = angles[i], angles[i + 1]
        span = a - b
        frac = (a - t) / span if span > 1e-12 else 0
        p0, p1 = pts[i], pts[i + 1]
        return (p0[0] + (p1[0] - p0[0]) * frac, p0[1] + (p1[1] - p0[1]) * frac)

    return centerR, boundary_at


# ---------- src/geom/mesh.js buildRingConnectivity port ----------
def build_ogrid_mesh(center_r, boundary_at, n_rho=14, n_theta=32):
    nodes = [(center_r, 0.0)]
    node_rho = [0.0]
    ring_start = [1]
    for k in range(1, n_rho + 1):
        rho = k / n_rho
        ring_start.append(len(nodes))
        for j in range(n_theta):
            theta = 2 * math.pi * j / n_theta
            Rb, Zb = boundary_at(theta)
            nodes.append((center_r + rho * (Rb - center_r), rho * Zb))
            node_rho.append(rho)
    triangles = []
    ring1 = ring_start[1]
    for j in range(n_theta):
        j1 = (j + 1) % n_theta
        triangles.append((0, ring1 + j, ring1 + j1))
    for k in range(1, n_rho):
        kS, k1S = ring_start[k], ring_start[k + 1]
        for j in range(n_theta):
            j1 = (j + 1) % n_theta
            a0, a1_ = kS + j, kS + j1
            b0, b1_ = k1S + j, k1S + j1
            triangles.append((a0, b0, b1_))
            triangles.append((a0, b1_, a1_))
    boundary_start = ring_start[n_rho]
    boundary_nodes = [boundary_start + j for j in range(n_theta)]
    return {
        "nodes": nodes, "triangles": triangles, "boundaryNodes": boundary_nodes,
        "nodeRho": node_rho, "nRho": n_rho, "nTheta": n_theta,
    }


# ---------- src/braginskii/background.js port ----------
class BackgroundField:
    def __init__(self, r, z, psi, btf, rtf):
        self.r, self.z, self.psi, self.btf, self.rtf = r, z, psi, btf, rtf

    def _bracket(self, arr, x):
        n = len(arr)
        if x <= arr[0]: return 0
        if x >= arr[-1]: return n - 2
        for i in range(n - 1):
            if arr[i] <= x <= arr[i + 1]: return i
        return n - 2

    def psi_at(self, R, Z):
        j = self._bracket(self.r, R); k = self._bracket(self.z, Z)
        tR = (R - self.r[j]) / (self.r[j + 1] - self.r[j])
        tZ = (Z - self.z[k]) / (self.z[k + 1] - self.z[k])
        p00, p10 = self.psi[k][j], self.psi[k][j + 1]
        p01, p11 = self.psi[k + 1][j], self.psi[k + 1][j + 1]
        return p00 * (1 - tR) * (1 - tZ) + p10 * tR * (1 - tZ) + p01 * (1 - tR) * tZ + p11 * tR * tZ

    def field_at(self, R, Z, h=0.01):
        dpsidZ = (self.psi_at(R, Z + h) - self.psi_at(R, Z - h)) / (2 * h)
        dpsidR = (self.psi_at(R + h, Z) - self.psi_at(R - h, Z)) / (2 * h)
        bR, bZ = -dpsidZ / R, dpsidR / R
        bPol = math.hypot(bR, bZ)
        bHat = (bR / bPol, bZ / bPol) if bPol > 1e-12 else (1.0, 0.0)
        return bHat


bg = BackgroundField(D["backgroundGrid"]["r_m"], D["backgroundGrid"]["z_m"], D["backgroundGrid"]["psi"], D["btf_T"], D["rtf_m"])
centerR, boundary_at = build_iter_wall_boundary(D)
N_RHO, N_THETA = 14, 32
mesh = build_ogrid_mesh(centerR, boundary_at, N_RHO, N_THETA)
print(f"mesh: {len(mesh['nodes'])} nodes, {len(mesh['triangles'])} triangles")

# ---------- src/braginskii/closures.js port ----------
M_E = 9.10938e-31; M_P = 1.67262e-27; EVJ = 1.602176634e-19


def coulomb_log_ei(n_m3, Te_eV, Z=1):
    ncm3 = n_m3 * 1e-6
    if Te_eV < 10 * Z * Z:
        return 23 - math.log(math.sqrt(ncm3) * Z * Te_eV ** -1.5)
    return 24 - math.log(math.sqrt(ncm3) / Te_eV)


def tau_e(n_m3, Te_eV, lnL): return 3.44e5 * Te_eV ** 1.5 / ((n_m3 * 1e-6) * lnL)
def tau_i(n_m3, Ti_eV, lnL, mu=2): return 2.09e7 * Ti_eV ** 1.5 * math.sqrt(mu) / ((n_m3 * 1e-6) * lnL)
def kappa_par_e(n, Te, te): return 3.2 * n * (Te * EVJ) * te / M_E
def kappa_par_i(n, Ti, ti, mi): return 3.9 * n * (Ti * EVJ) * ti / mi
def qei(n, Te, Ti, te, mi): return 3 * (M_E / mi) * n * ((Te - Ti) * EVJ) / te


M_I = 2 * M_P


# ---------- src/braginskii/equations.js port: signed gradients, dofMap, mass, assembly ----------
def signed_tri_geom(nodes, tri):
    i, j, k = tri
    R1, Z1 = nodes[i]; R2, Z2 = nodes[j]; R3, Z3 = nodes[k]
    twoA = (R2 - R1) * (Z3 - Z1) - (R3 - R1) * (Z2 - Z1)
    b = [Z2 - Z3, Z3 - Z1, Z1 - Z2]
    c = [R3 - R2, R1 - R3, R2 - R1]
    gradN = [(b[a] / twoA, c[a] / twoA) for a in range(3)]
    area = abs(twoA) / 2
    return area, gradN


core_ring_frac = 0.15
core_ring = max(1, round(core_ring_frac * N_RHO))
ring_of = [round(rho * N_RHO) for rho in mesh["nodeRho"]]
is_fixed = [ring_of[i] <= core_ring for i in range(len(mesh["nodes"]))]
is_wall = [False] * len(mesh["nodes"])
for idx in mesh["boundaryNodes"]: is_wall[idx] = True

global_to_free = [-1] * len(mesh["nodes"])
free_to_global = []
for g in range(len(mesh["nodes"])):
    if not is_fixed[g]:
        global_to_free[g] = len(free_to_global)
        free_to_global.append(g)
nFree = len(free_to_global)
print(f"nFree={nFree}, fixed(core)={sum(is_fixed)}, wall={sum(is_wall)}")

tri_geom = []
for tri in mesh["triangles"]:
    area, gradN = signed_tri_geom(mesh["nodes"], tri)
    R1, Z1 = mesh["nodes"][tri[0]]; R2, Z2 = mesh["nodes"][tri[1]]; R3, Z3 = mesh["nodes"][tri[2]]
    Rc, Zc = (R1 + R2 + R3) / 3, (Z1 + Z2 + Z3) / 3
    bHat = bg.field_at(Rc, Zc)
    tri_geom.append({"tri": tri, "area": area, "gradN": gradN, "Rc": Rc, "Zc": Zc, "bHat": bHat})

bad_tris = [t for t in tri_geom if t["area"] < 1e-10 or any(math.isnan(v) for v in t["bHat"])]
print("degenerate/NaN triangles:", len(bad_tris))


def lumped_mass(weight_fn):
    M = np.zeros(len(mesh["nodes"]))
    for t in tri_geom:
        for idx in t["tri"]:
            M[idx] += t["area"] / 3 * weight_fn(idx)
    return M


def wall_segments():
    ring = mesh["boundaryNodes"]; n = len(ring)
    segs = {}
    for i in range(n):
        idx = ring[i]
        prevp = mesh["nodes"][ring[(i - 1) % n]]
        nextp = mesh["nodes"][ring[(i + 1) % n]]
        R, Z = mesh["nodes"][idx]
        tx, ty = nextp[0] - prevp[0], nextp[1] - prevp[1]
        nx, ny = ty, -tx
        norm = math.hypot(nx, ny) or 1
        nx, ny = nx / norm, ny / norm
        toCx, toCy = centerR - R, 0 - Z
        if nx * toCx + ny * toCy > 0: nx, ny = -nx, -ny
        dPrev = math.hypot(R - prevp[0], Z - prevp[1])
        dNext = math.hypot(nextp[0] - R, nextp[1] - Z)
        segs[idx] = {"normal": (nx, ny), "halfLength": (dPrev + dNext) / 2}
    return segs


wseg = wall_segments()

wall_field = {}
for g in mesh["boundaryNodes"]:
    for t in tri_geom:
        if g in t["tri"]:
            wall_field[g] = t["bHat"]; break


def assemble_and_solve(mass, u_old, dt, coeff_at, reaction_at, wall_robin, fixed_values):
    A = np.zeros((nFree, nFree))
    rhs = np.zeros(nFree)
    for g in range(len(mesh["nodes"])):
        i = global_to_free[g]
        if i < 0: continue
        A[i, i] += mass[g] / dt
        rhs[i] += (mass[g] / dt) * u_old[g] + mass[g] * reaction_at(g)
    for ti, t in enumerate(tri_geom):
        tri = t["tri"]; area = t["area"]; gradN = t["gradN"]; bR, bZ = t["bHat"]
        kappaPar, chiPerpN = coeff_at(ti)
        for a in range(3):
            ga = gradN[a]
            gaPar = ga[0] * bR + ga[1] * bZ
            gaPerpR, gaPerpZ = ga[0] - gaPar * bR, ga[1] - gaPar * bZ
            for b in range(3):
                gb = gradN[b]
                gbPar = gb[0] * bR + gb[1] * bZ
                gbPerpR, gbPerpZ = gb[0] - gbPar * bR, gb[1] - gbPar * bZ
                kij = area * (kappaPar * gaPar * gbPar + chiPerpN * (gaPerpR * gbPerpR + gaPerpZ * gbPerpZ))
                if kij == 0: continue
                ga_g, gb_g = tri[a], tri[b]
                ia, ib = global_to_free[ga_g], global_to_free[gb_g]
                if ia >= 0 and ib >= 0:
                    A[ia, ib] += kij
                elif ia >= 0 and ib < 0:
                    rhs[ia] -= kij * fixed_values[gb_g]
    for g in range(len(mesh["nodes"])):
        i = global_to_free[g]
        if i < 0: continue
        robin = wall_robin(g)
        if robin is None: continue
        A[i, i] += robin[0]
        rhs[i] += robin[1]
    x = np.linalg.solve(A, rhs)
    full = np.array(u_old, dtype=float)
    for g in range(len(mesh["nodes"])):
        i = global_to_free[g]
        full[g] = x[i] if i >= 0 else fixed_values[g]
    return full


def sound_speed(Te, Ti, mu=2):
    mi = mu * M_P
    return math.sqrt((Te + Ti) * EVJ / mi)


# ---------- src/braginskii/timestep.js port ----------
def step(state, params, dt):
    n, Ti, Te = state
    fixedN = np.full(len(mesh["nodes"]), params["coreN"])
    fixedT = np.full(len(mesh["nodes"]), params["coreT"])

    massN = lumped_mass(lambda g: 1)
    coeffN = lambda t: (0.0, params["dPerp"])
    reactionN = lambda g: 0.0

    def robinN(g):
        if g not in wseg: return None
        cs = sound_speed(Te[g], Ti[g], params["mu"])
        bHat = wall_field.get(g, (1, 0))
        seg = wseg[g]
        incidence = abs(bHat[0] * seg["normal"][0] + bHat[1] * seg["normal"][1])
        return (incidence * cs * seg["halfLength"], 0.0)

    nNew = assemble_and_solve(massN, n, dt, coeffN, reactionN, robinN, fixedN)

    massTi = lumped_mass(lambda g: 1.5 * nNew[g])

    def coeffTi(ti):
        tri = tri_geom[ti]["tri"]
        nAvg = sum(nNew[i] for i in tri) / 3
        TiAvg = sum(Ti[i] for i in tri) / 3
        TeAvg = sum(Te[i] for i in tri) / 3
        lnL = coulomb_log_ei(nAvg, TeAvg)
        ti_coll = tau_i(nAvg, TiAvg, lnL, params["mu"])
        return (kappa_par_i(nAvg, TiAvg, ti_coll, M_I), params["chiPerp"] * nAvg)

    def reactionTi(g):
        lnL = coulomb_log_ei(nNew[g], Te[g])
        te_coll = tau_e(nNew[g], Te[g], lnL)
        q = qei(nNew[g], Te[g], Ti[g], te_coll, M_I)
        return q / (1.5 * nNew[g] * EVJ)

    def robinTi(g):
        if g not in wseg: return None
        cs = sound_speed(Te[g], Ti[g], params["mu"])
        bHat = wall_field.get(g, (1, 0)); seg = wseg[g]
        incidence = abs(bHat[0] * seg["normal"][0] + bHat[1] * seg["normal"][1])
        alpha = params["deltaI1"] * incidence * cs * nNew[g] * seg["halfLength"]
        return (alpha, 0.0)

    TiNew = assemble_and_solve(massTi, Ti, dt, coeffTi, reactionTi, robinTi, fixedT)

    massTe = lumped_mass(lambda g: 1.5 * nNew[g])

    def coeffTe(ti):
        tri = tri_geom[ti]["tri"]
        nAvg = sum(nNew[i] for i in tri) / 3
        TeAvg = sum(Te[i] for i in tri) / 3
        lnL = coulomb_log_ei(nAvg, TeAvg)
        te_coll = tau_e(nAvg, TeAvg, lnL)
        return (kappa_par_e(nAvg, TeAvg, te_coll), params["chiPerp"] * nAvg)

    def reactionTe(g):
        lnL = coulomb_log_ei(nNew[g], Te[g])
        te_coll = tau_e(nNew[g], Te[g], lnL)
        q = qei(nNew[g], Te[g], TiNew[g], te_coll, M_I)
        return -q / (1.5 * nNew[g] * EVJ)

    deltaE = (1 + params["gammaE"]) / (1 - params["gammaE"])

    def robinTe(g):
        if g not in wseg: return None
        cs = sound_speed(Te[g], TiNew[g], params["mu"]); bHat = wall_field.get(g, (1, 0)); seg = wseg[g]
        incidence = abs(bHat[0] * seg["normal"][0] + bHat[1] * seg["normal"][1])
        alpha = deltaE * incidence * cs * nNew[g] * seg["halfLength"]
        return (alpha, 0.0)

    TeNew = assemble_and_solve(massTe, Te, dt, coeffTe, reactionTe, robinTe, fixedT)

    return nNew, TiNew, TeNew


def main():
    params = {"coreN": 2e19, "coreT": 275.0, "dPerp": 0.4, "chiPerp": 1.6, "deltaI1": 2.5, "gammaE": 0.0, "mu": 2}
    n0 = np.full(len(mesh["nodes"]), params["coreN"])
    Ti0 = np.full(len(mesh["nodes"]), params["coreT"])
    Te0 = np.full(len(mesh["nodes"]), params["coreT"])
    state = (n0, Ti0, Te0)
    dt = 2e-7

    failures = 0
    for step_i in range(60):
        state = step(state, params, dt)
        n, Ti, Te = state
        if np.isnan(n).any() or np.isnan(Ti).any() or np.isnan(Te).any():
            print(f"FAIL  step {step_i}: NaN encountered")
            failures += 1
            break
    else:
        n, Ti, Te = state
        n_wall = np.mean(n[mesh["boundaryNodes"]])
        Ti_wall = np.mean(Ti[mesh["boundaryNodes"]])
        Te_wall = np.mean(Te[mesh["boundaryNodes"]])
        print(f"after 60 steps: n_wall_avg={n_wall:.3e} m^-3, Ti_wall_avg={Ti_wall:.2f} eV, Te_wall_avg={Te_wall:.2f} eV")

        def check(label, cond, detail=""):
            nonlocal failures
            print(f"{'OK  ' if cond else 'FAIL'}  {label}{'  (' + detail + ')' if detail else ''}")
            if not cond: failures += 1

        check("no NaN/Inf anywhere", np.isfinite(n).all() and np.isfinite(Ti).all() and np.isfinite(Te).all())
        check("density positive everywhere", (n > 0).all())
        check("wall density fell below core value (Bohm sink active)", n_wall < params["coreN"])
        check("T_i and T_e stay at or below the core temperature", Ti_wall <= params["coreT"] + 1e-6 and Te_wall <= params["coreT"] + 1e-6)
        check("T_i cools faster than T_e at the wall (kappa_par_e >> kappa_par_i)", Ti_wall < Te_wall)

    print("\nAll checks passed." if failures == 0 else f"\n{failures} check(s) FAILED.")
    return failures


if __name__ == "__main__":
    raise SystemExit(1 if main() else 0)
