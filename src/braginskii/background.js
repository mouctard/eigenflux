// Background magnetic field for the Braginskii solve: bilinear lookup on the real,
// coarsened ITER psi(R,Z) grid (data/iter_equilibrium.json's backgroundGrid -- see
// tools/export_iter_equilibrium.py's module docstring for why this is a real quantity
// even in the SOL, not an extrapolation: the raw equilibrium file's grid already spans
// R in [3.08,9.32] m, Z in [-6.04,6.44] m, well past the LCFS). Poloidal field
// B_pol = |grad(psi)|/R (finite differences on the grid); toroidal field
// B_tor(R) = btf*rtf/R, the same vacuum approximation already used honestly elsewhere in
// this codebase (src/geom/iterEquilibrium.js).
export async function loadBackgroundField(dataUrl = "data/iter_equilibrium.json") {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`failed to load ${dataUrl}: ${res.status}`);
  const data = await res.json();
  const grid = data.backgroundGrid;
  return new BackgroundField(grid.r_m, grid.z_m, grid.psi, data.btf_T, data.rtf_m, data);
}

export class BackgroundField {
  constructor(r, z, psi, btf, rtf, iterData) {
    this.r = r;
    this.z = z;
    this.psi = psi; // psi[k][j], k over z, j over r -- see export script
    this.btf = btf;
    this.rtf = rtf;
    this.iterData = iterData;
  }

  psiAt(R, Z) {
    const { r, z, psi } = this;
    const j = clampBracketIndex(r, R);
    const k = clampBracketIndex(z, Z);
    const tR = (R - r[j]) / (r[j + 1] - r[j]);
    const tZ = (Z - z[k]) / (z[k + 1] - z[k]);
    const p00 = psi[k][j], p10 = psi[k][j + 1];
    const p01 = psi[k + 1][j], p11 = psi[k + 1][j + 1];
    return p00 * (1 - tR) * (1 - tZ) + p10 * tR * (1 - tZ) + p01 * (1 - tR) * tZ + p11 * tR * tZ;
  }

  // Poloidal field components, B_R = -(1/R) dpsi/dZ, B_Z = (1/R) dpsi/dR.
  bPolAt(R, Z, h = 0.01) {
    const dpsidZ = (this.psiAt(R, Z + h) - this.psiAt(R, Z - h)) / (2 * h);
    const dpsidR = (this.psiAt(R + h, Z) - this.psiAt(R - h, Z)) / (2 * h);
    return [-dpsidZ / R, dpsidR / R];
  }

  bTorAt(R) {
    return (this.btf * this.rtf) / R;
  }

  // Full field magnitude and the poloidal-plane unit vector b_pol_hat = (B_R,B_Z)/|B_pol|
  // -- the parallel-transport direction used throughout src/braginskii/equations.js,
  // matching the reference paper's own convention ("poloidal direction points along the
  // poloidal projection of the magnetic field").
  fieldAt(R, Z) {
    const [bR, bZ] = this.bPolAt(R, Z);
    const bPol = Math.hypot(bR, bZ);
    const bTor = this.bTorAt(R);
    const bMag = Math.hypot(bPol, bTor);
    const bHatPol = bPol > 1e-12 ? [bR / bPol, bZ / bPol] : [1, 0];
    return { bR, bZ, bPol, bTor, bMag, bHatPol };
  }
}

function clampBracketIndex(arr, x) {
  const n = arr.length;
  if (x <= arr[0]) return 0;
  if (x >= arr[n - 1]) return n - 2;
  // linear scan is fine here: grid is only ~65x129 and this runs during mesh setup, not
  // per-timestep (per-timestep code caches field values on mesh nodes, see equations.js)
  for (let i = 0; i < n - 1; i++) {
    if (arr[i] <= x && x <= arr[i + 1]) return i;
  }
  return n - 2;
}
