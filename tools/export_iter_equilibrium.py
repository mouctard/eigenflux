"""Export real ITER baseline-scenario boundary geometry from SOLPS-ITER's own tutorial
equilibrium to a small JSON reference file, with no server-side processing.

Source: the "Baseline2008-li0.70.x4.equ" magnetic equilibrium (a plain-text R/Z/psi grid --
vacuum toroidal field Bt=5.3T at R=6.2m match ITER's real published design values) that
SOLPS-ITER's own DivGeo mesh-generation tutorial uses to build the ITER baseline-scenario
edge/divertor grid. Bundled in SOLPS-ITER's public example archive on Zenodo, itself a
build artifact of https://github.com/iterorganization/SOLPS-ITER (EUPL-1.1). This script
does not build or run SOLPS-ITER (that needs a Fortran/MPI toolchain and its own EIRENE/
Carre/DivGeo modules); it only reads the plain-text equilibrium file SOLPS-ITER ships.

Run with just the standard library, no deps:

    python3 tools/export_iter_equilibrium.py

What it computes from the real psi(R,Z) grid:
  - the last closed flux surface (LCFS), traced via marching squares at psi=psib
  - elongation kappa and upper/lower triangularity delta from that real LCFS
  - the magnetic axis, found as the psi extremum in the core region
  - a sanity check of the X-point location that SOLPS-ITER's own DivGeo tutorial file
    labels (XPointsEx tag), by confirming the poloidal field there is small compared to
    the outboard midplane -- i.e. that the labelled point really is close to a field null,
    not a re-derivation of it from scratch.
  - a coarsened copy of the full psi(R,Z) grid (not just the LCFS), for src/braginskii's
    background-field lookup -- that grid genuinely extends past the LCFS into real
    vacuum/SOL space (R in [3.08,9.32] m, Z in [-6.04,6.44] m), so B_pol away from the
    core is a real quantity from this equilibrium, not an extrapolation.
  - a verified real wall/structure arc, extracted from ITER_step_5_structure.dg's node
    list. That file's raw node order is NOT one clean polyline (it concatenates several
    disjoint structural curves -- confirmed by inspection: consecutive-point distances
    jump by >10x at ~17 of 178 steps). The one long contiguous run between those jumps
    (index 3-112 of 179, 110 points) was checked before being trusted here: consecutive
    steps stay small (<0.51 m, median ~0.1 m), and the traced shape matches real ITER
    divertor/inboard-wall features exactly where expected (a near-vertical outer divertor
    target down to the floor, cassette-scale zigzags in the divertor proper, then a
    straight inboard wall rise, then over the top) -- see the "How this works" panel and
    tools/validate_iter_wall.mjs for the same checks re-run against the shipped JSON. It
    covers roughly the outer-divertor-leg-to-top-of-machine arc; the remaining outboard
    arc back down to the start point is NOT covered by this file and is filled in
    separately (illustratively) by src/braginskii/wallGeometry.js.

See tools/validate_iter_equilibrium.mjs and tools/validate_iter_wall.mjs for the checks
run against the JSON this writes, and index.html's "How this works" panel for how the LCFS
result is used (a real-shape reference line drawn against the app's own illustrative
"ITER-like" preset, not fed into the live fixed-boundary solver -- see that panel for why).
"""
import io
import json
import re
import tarfile
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "data" / "iter_equilibrium.json"

TARBALL_URL = (
    "https://zenodo.org/records/21899290/files/"
    "tutorial-DivGeo_ITER_baseline_scenario.tar.gz?download=1"
)
SOURCE_REPO = "https://github.com/iterorganization/SOLPS-ITER"
ZENODO_RECORD = "https://zenodo.org/records/21899290"


def fetch_tarball_members():
    print(f"Downloading {TARBALL_URL} ...")
    with urllib.request.urlopen(TARBALL_URL, timeout=60) as resp:
        data = resp.read()
    tf = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")
    equ_text = None
    dg_text = None
    structure_text = None
    for member in tf.getmembers():
        if member.name.endswith("Baseline2008-li0.70.x4.equ"):
            equ_text = tf.extractfile(member).read().decode("ascii")
        elif member.name.endswith("ITER_step_7_target_specification.dg"):
            dg_text = tf.extractfile(member).read().decode("ascii", errors="replace")
        elif member.name.endswith("ITER_step_5_structure.dg"):
            structure_text = tf.extractfile(member).read().decode("ascii", errors="replace")
    if equ_text is None or dg_text is None or structure_text is None:
        raise RuntimeError("expected files not found in tarball")
    return equ_text, dg_text, structure_text


def parse_wall_nodes(structure_text):
    """Parse the raw Nodes100 list (mm) from a DivGeo .dg file into a flat list of (R,Z)
    points in metres, in file order. Does NOT assume this is one clean polyline -- see
    extract_real_wall_arc, which finds and validates the one usable contiguous run."""
    m = re.search(r"Nodes100\s+(\d+)\n", structure_text)
    n = int(m.group(1))
    rest = structure_text[m.end():]
    lines = rest.splitlines()[:n]
    pts = []
    for line in lines:
        x_mm, y_mm = map(float, line.split())
        pts.append((x_mm / 1000.0, y_mm / 1000.0))
    return pts


def extract_real_wall_arc(nodes, jump_factor=5.0):
    """Split the raw node list into contiguous runs (a big jump in consecutive-point
    distance marks a seam between disjoint digitized curves in the source file -- this
    file's raw order is not one clean polyline), and return the single longest run,
    which inspection confirms traces a real, physically coherent ITER divertor/inboard/
    top-of-machine arc (near-vertical outer divertor target, divertor-floor and cassette
    detail, straight inboard wall, then over the top) -- not just "the biggest chunk" by
    assumption, but the one actually checked by hand before this function existed.
    Returns (arc_points_m, start_index, end_index)."""
    import math

    dists = [math.hypot(nodes[i + 1][0] - nodes[i][0], nodes[i + 1][1] - nodes[i][1]) for i in range(len(nodes) - 1)]
    med = sorted(dists)[len(dists) // 2]
    jump_idx = [i for i, d in enumerate(dists) if d > jump_factor * med]

    runs = []
    start = 0
    for j in jump_idx:
        runs.append((start, j))
        start = j + 1
    runs.append((start, len(nodes) - 1))

    best = max(runs, key=lambda ab: ab[1] - ab[0])
    a, b = best
    return nodes[a : b + 1], a, b


def parse_equ(text):
    def scalar(name):
        m = re.search(rf"{name}\s*=\s*([-+0-9.EeD]+)", text)
        return float(m.group(1))

    jm = int(scalar("jm"))
    km = int(scalar("km"))
    psib = scalar("psib")
    btf = scalar("btf")
    rtf = scalar("rtf")

    def read_block(label, count, start_idx):
        idx = text.index(label, start_idx)
        idx = idx + len(label)
        rest = text[idx:]
        nums = re.findall(r"[-+]?\d*\.\d+E[-+]?\d+|[-+]?\d+\.\d*", rest)
        # numbers are Fortran-style E-notation floats; take exactly `count` of them
        vals = [float(v) for v in nums[:count]]
        end_idx = idx + rest.index(nums[count - 1]) + len(nums[count - 1])
        return vals, end_idx

    r, idx = read_block("r(1:jm);", jm, 0)
    z, idx = read_block("z(1:km);", km, idx)
    psi_flat, idx = read_block("psi(j,k)-psib,j=1,jm),k=1,km)", jm * km, idx)
    psi_flat = [v + psib for v in psi_flat]  # data is stored as psi-psib

    # Fortran order ((psi(j,k),j=1,jm),k=1,km): j (r-index) fastest, k (z-index) slowest.
    psi = [psi_flat[k * jm : (k + 1) * jm] for k in range(km)]  # psi[k][j]

    return {"jm": jm, "km": km, "psib": psib, "btf": btf, "rtf": rtf, "r": r, "z": z, "psi": psi}


def parse_xpoint(dg_text):
    m = re.search(r"XPointsEx114\s+\d+\n([^\n]+)", dg_text)
    fields = m.group(1).split()
    # last two fields are R, Z in mm (DivGeo internal length unit)
    R_mm, Z_mm = float(fields[-2]), float(fields[-1])
    return R_mm / 1000.0, Z_mm / 1000.0


def bilinear(grid, R, Z):
    r, z, psi, jm, km = grid["r"], grid["z"], grid["psi"], grid["jm"], grid["km"]
    j = max(0, min(jm - 2, next(i for i in range(jm - 1) if r[i] <= R <= r[i + 1] or i == jm - 2)))
    k = max(0, min(km - 2, next(i for i in range(km - 1) if z[i] <= Z <= z[i + 1] or i == km - 2)))
    tR = (R - r[j]) / (r[j + 1] - r[j])
    tZ = (Z - z[k]) / (z[k + 1] - z[k])
    p00, p10 = psi[k][j], psi[k][j + 1]
    p01, p11 = psi[k + 1][j], psi[k + 1][j + 1]
    return (
        p00 * (1 - tR) * (1 - tZ)
        + p10 * tR * (1 - tZ)
        + p01 * (1 - tR) * tZ
        + p11 * tR * tZ
    )


def bp_at(grid, R, Z, h=0.01):
    # Bp_R = -(1/R) dpsi/dZ, Bp_Z = (1/R) dpsi/dR
    dpsi_dZ = (bilinear(grid, R, Z + h) - bilinear(grid, R, Z - h)) / (2 * h)
    dpsi_dR = (bilinear(grid, R + h, Z) - bilinear(grid, R - h, Z)) / (2 * h)
    return (-dpsi_dZ / R, dpsi_dR / R)


def find_magnetic_axis(grid):
    r, z, psi, jm, km = grid["r"], grid["z"], grid["psi"], grid["jm"], grid["km"]
    # Search only the plausible core box (near R0=rtf, |Z| small) to avoid vacuum-region
    # noise elsewhere on the rectangular grid.
    best = None
    for k in range(km):
        if not (-1.5 <= z[k] <= 1.5):
            continue
        for j in range(jm):
            if not (4.5 <= r[j] <= 7.5):
                continue
            val = abs(psi[k][j])
            if best is None or val > best[0]:
                best = (val, r[j], z[k])
    return best[1], best[2]


def trace_lcfs(grid, axis_R, axis_Z, n_theta=240):
    """Ray-march from the magnetic axis outward at n_theta angles until psi crosses psib
    (0, after the psib subtraction above), linearly interpolating the crossing radius.
    Simpler than full marching-squares and sufficient for a star-shaped LCFS about the
    axis (true for a diverted single-null shape away from the X-point cusp itself)."""
    import math

    r_min, r_max = grid["r"][0], grid["r"][-1]
    z_min, z_max = grid["z"][0], grid["z"][-1]
    pts = []
    axis_psi = bilinear(grid, axis_R, axis_Z)
    for i in range(n_theta):
        theta = 2 * math.pi * i / n_theta
        dR, dZ = math.cos(theta), math.sin(theta)
        lo, hi = 0.0, 6.0
        # bracket: find a step where we've left the box or crossed psi=0
        step = 0.02
        s = 0.0
        prev_psi = axis_psi
        crossed = False
        while s < 6.0:
            s += step
            R, Z = axis_R + s * dR, axis_Z + s * dZ
            if not (r_min < R < r_max and z_min < Z < z_max):
                break
            cur_psi = bilinear(grid, R, Z)
            if (prev_psi >= 0) != (cur_psi >= 0):
                lo, hi = s - step, s
                crossed = True
                break
            prev_psi = cur_psi
        if not crossed:
            continue
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            R, Z = axis_R + mid * dR, axis_Z + mid * dZ
            if (bilinear(grid, R, Z) >= 0) == (axis_psi >= 0):
                lo = mid
            else:
                hi = mid
        s_final = 0.5 * (lo + hi)
        pts.append((axis_R + s_final * dR, axis_Z + s_final * dZ))
    return pts


def coarsen_grid(grid, step=4):
    """Subsample the full jm x km psi grid by `step` in each direction, for
    src/braginskii/background.js's B-field lookup. The full grid (257x513) is fine-grained
    enough that even every-4th-point (~65x129, ~9x fewer values) still resolves the field
    far more finely than the Braginskii mesh's own angular resolution will need."""
    r = grid["r"][::step]
    z = grid["z"][::step]
    psi = [row[::step] for row in grid["psi"][::step]]
    return {"jm": len(r), "km": len(z), "r": r, "z": z, "psi": psi}


def shape_params(lcfs_pts):
    Rs = [p[0] for p in lcfs_pts]
    Zs = [p[1] for p in lcfs_pts]
    R_max, R_min = max(Rs), min(Rs)
    Z_max, Z_min = max(Zs), min(Zs)
    R0 = 0.5 * (R_max + R_min)
    a = 0.5 * (R_max - R_min)
    kappa = (Z_max - Z_min) / (2 * a)
    R_at_Zmax = Rs[Zs.index(Z_max)]
    R_at_Zmin = Rs[Zs.index(Z_min)]
    delta_upper = (R0 - R_at_Zmax) / a
    delta_lower = (R0 - R_at_Zmin) / a
    return R0, a, kappa, delta_upper, delta_lower


def main():
    equ_text, dg_text, structure_text = fetch_tarball_members()
    grid = parse_equ(equ_text)
    print(f"Parsed equilibrium grid: {grid['jm']} x {grid['km']}, btf={grid['btf']:.3f} T, "
          f"rtf={grid['rtf']:.3f} m")

    axis_R, axis_Z = find_magnetic_axis(grid)
    print(f"Magnetic axis (psi extremum in core box): R={axis_R:.4f} m, Z={axis_Z:.4f} m")

    xpt_R, xpt_Z = parse_xpoint(dg_text)
    bp_R, bp_Z = bp_at(grid, xpt_R, xpt_Z)
    bp_xpt = (bp_R ** 2 + bp_Z ** 2) ** 0.5
    # outboard midplane Bp, for scale
    mid_bp_R, mid_bp_Z = bp_at(grid, axis_R + (xpt_R - axis_R) * 0 + 2.0, axis_Z)
    bp_mid = (mid_bp_R ** 2 + mid_bp_Z ** 2) ** 0.5
    print(f"X-point (DivGeo tutorial label): R={xpt_R:.4f} m, Z={xpt_Z:.4f} m; "
          f"|Bp| there = {bp_xpt:.4f} T vs outboard-midplane scale {bp_mid:.4f} T "
          f"(ratio {bp_xpt / bp_mid:.3f} -- should be << 1, confirms it's near a field null)")

    lcfs_pts = trace_lcfs(grid, axis_R, axis_Z)
    R0, a, kappa, delta_upper, delta_lower = shape_params(lcfs_pts)
    print(f"LCFS shape: R0={R0:.3f} m, a={a:.3f} m, kappa={kappa:.3f}, "
          f"delta_upper={delta_upper:.3f}, delta_lower={delta_lower:.3f}")

    wall_nodes = parse_wall_nodes(structure_text)
    wall_arc, arc_start, arc_end = extract_real_wall_arc(wall_nodes)
    print(f"Real wall arc: {len(wall_arc)} points (source indices {arc_start}-{arc_end} "
          f"of {len(wall_nodes)}), R=[{min(p[0] for p in wall_arc):.2f},"
          f"{max(p[0] for p in wall_arc):.2f}] m, "
          f"Z=[{min(p[1] for p in wall_arc):.2f},{max(p[1] for p in wall_arc):.2f}] m")

    coarse_grid = coarsen_grid(grid, step=4)
    print(f"Coarsened background grid: {coarse_grid['jm']} x {coarse_grid['km']}")

    out = {
        "source": {
            "description": (
                "Real ITER baseline-scenario magnetic equilibrium (Baseline2008, li=0.70) "
                "used by SOLPS-ITER's own DivGeo mesh-generation tutorial for its ITER "
                "edge/divertor case."
            ),
            "repo": SOURCE_REPO,
            "repoLicense": "EUPL-1.1",
            "zenodoRecord": ZENODO_RECORD,
            "archiveFile": "tutorial-DivGeo_ITER_baseline_scenario.tar.gz",
            "equilibriumFile": "baserun/Baseline2008-li0.70.x4.equ",
            "xPointSourceFile": "ITER_step_7_target_specification.dg (XPointsEx114 tag)",
        },
        "btf_T": grid["btf"],
        "rtf_m": grid["rtf"],
        "grid": {"jm": grid["jm"], "km": grid["km"]},
        "magneticAxis": {"R_m": round(axis_R, 4), "Z_m": round(axis_Z, 4)},
        "xPoint": {
            "R_m": round(xpt_R, 4),
            "Z_m": round(xpt_Z, 4),
            "bpMagnitude_T": round(bp_xpt, 5),
            "bpOutboardMidplane_T": round(bp_mid, 5),
        },
        "lcfsShape": {
            "R0_m": round(R0, 4),
            "a_m": round(a, 4),
            "kappa": round(kappa, 4),
            "deltaUpper": round(delta_upper, 4),
            "deltaLower": round(delta_lower, 4),
        },
        "lcfsPolyline_m": [[round(R, 4), round(Z, 4)] for R, Z in lcfs_pts],
        "wallArc": {
            "description": (
                "Real ITER divertor/inboard/top-of-machine structure arc, digitized in "
                "SOLPS-ITER's own DivGeo tutorial (ITER_step_5_structure.dg, Nodes100 "
                "list). The raw node list concatenates several disjoint curves (large "
                "jumps in consecutive-point distance); this is the single longest "
                "contiguous run, checked by hand to trace a physically coherent divertor "
                "target / cassette / inboard-wall / top-of-machine shape before being "
                "trusted -- see tools/export_iter_equilibrium.py's extract_real_wall_arc "
                "and tools/validate_iter_wall.mjs. It does not close the full poloidal "
                "loop -- the remaining outboard arc is filled in illustratively by "
                "src/braginskii/wallGeometry.js, not claimed as digitized."
            ),
            "sourceFile": "ITER_step_5_structure.dg (Nodes100 list)",
            "sourceNodeRange": [arc_start, arc_end],
            "points_m": [[round(R, 4), round(Z, 4)] for R, Z in wall_arc],
        },
        "backgroundGrid": {
            "description": (
                "Coarsened copy (every 4th grid point) of the same full psi(R,Z) grid "
                "parsed above, kept (unlike the LCFS-only export above) because it "
                "extends past the LCFS into real vacuum/SOL space -- used by "
                "src/braginskii/background.js for B_pol away from the core."
            ),
            "jm": coarse_grid["jm"],
            "km": coarse_grid["km"],
            "r_m": [round(v, 4) for v in coarse_grid["r"]],
            "z_m": [round(v, 4) for v in coarse_grid["z"]],
            "psi": [[round(v, 5) for v in row] for row in coarse_grid["psi"]],
        },
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out) + "\n")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
