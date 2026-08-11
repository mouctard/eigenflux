"""Export nested flux surfaces from real DESC-solved stellarator equilibria to a compact
binary format the 3D viewer can load directly, with no server-side processing.

Run in a Python env with `desc-opt` installed (this repo used a dedicated conda env,
`conda create -n desc python=3.11 && pip install desc-opt`, since DESC pulls in JAX and
several native-extension packages that don't belong in a general-purpose env):

    python tools/export_stellarators.py

Source equilibria are precomputed solves published in the DESC repository itself
(desc/examples/*_output.h5) -- real DESC-solved 3D MHD equilibria for real stellarators,
not something this script solves itself. See index.html / stellarator.html "how it works"
panels for what that does and doesn't mean.

Output format (little-endian), one file per configuration:
    int32   nSurfaces, nTheta, nZeta, NFP
    for each surface (outermost/boundary last):
        float32[nZeta * nTheta]  X
        float32[nZeta * nTheta]  Y
        float32[nZeta * nTheta]  Z
    (zeta-major, theta-minor -- matches desc.grid.LinearGrid's node ordering)
"""
import struct
import urllib.request
from pathlib import Path

import numpy as np
from desc.equilibrium import EquilibriaFamily
from desc.grid import LinearGrid

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / ".cache" / "desc_downloads"
OUT_DIR = REPO_ROOT / "data" / "stellarators"

BASE_URL = "https://raw.githubusercontent.com/PlasmaControl/DESC/master/desc/examples/"

CONFIGS = {
    "w7x": "W7-X",
    "hsx": "HSX",
    "ncsx": "NCSX",
}

N_THETA = 32
N_ZETA = 96
RHOS = [0.3, 0.55, 0.8, 1.0]


def download(name):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"{name}_output.h5"
    if not dest.exists():
        url = f"{BASE_URL}{name}_output.h5"
        print(f"  downloading {url}")
        urllib.request.urlretrieve(url, dest)
    return dest


def export_one(key, desc_name):
    print(f"[{key}] loading {desc_name} ...")
    path = download(desc_name)
    fam = EquilibriaFamily.load(str(path))
    eq = fam[-1]
    print(f"[{key}] NFP={eq.NFP} sym={eq.sym}")

    surfaces = []
    for rho in RHOS:
        grid = LinearGrid(rho=np.array([rho]), theta=N_THETA, zeta=N_ZETA, NFP=1, endpoint=False)
        data = eq.compute(["X", "Y", "Z"], grid=grid)
        X = np.asarray(data["X"], dtype=np.float32)
        Y = np.asarray(data["Y"], dtype=np.float32)
        Z = np.asarray(data["Z"], dtype=np.float32)
        assert X.shape == (N_THETA * N_ZETA,)
        surfaces.append((X, Y, Z))
        print(f"[{key}]   rho={rho}: R range via X/Y ~[{np.hypot(X,Y).min():.3f}, {np.hypot(X,Y).max():.3f}], Z range [{Z.min():.3f}, {Z.max():.3f}]")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{key}.bin"
    with open(out_path, "wb") as f:
        f.write(struct.pack("<iiii", len(surfaces), N_THETA, N_ZETA, int(eq.NFP)))
        for X, Y, Z in surfaces:
            f.write(X.tobytes())
            f.write(Y.tobytes())
            f.write(Z.tobytes())

    print(f"[{key}] wrote {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    for key, desc_name in CONFIGS.items():
        export_one(key, desc_name)
    print("done.")
