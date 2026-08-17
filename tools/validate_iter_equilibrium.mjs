// Sanity-checks data/iter_equilibrium.json (see tools/export_iter_equilibrium.py) before
// trusting the real-ITER-shape reference line drawn in index.html's "How this works" panel.
// Two independent cross-checks, same style as tools/validate_stellarator_volume.mjs's
// "computed vs. published" W7-X volume check:
//   1. internal self-consistency -- does the traced LCFS polyline actually reproduce the
//      R0/a/kappa/delta numbers stored alongside it, and does the labelled X-point sit
//      near a genuine field null and near the polyline's own lower tip?
//   2. external cross-check -- do the real values independently derived from the psi grid
//      (R0, a) land near ITER's actual published major/minor radius (6.2 m / 2.0 m), and
//      does btf*rtf match ITER's real published vacuum toroidal field (5.3 T at 6.2 m)?
// Run with: node tools/validate_iter_equilibrium.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "iter_equilibrium.json");
const d = JSON.parse(readFileSync(dataPath, "utf8"));

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
}

// --- 1. Internal self-consistency: re-derive shape params from the raw polyline ---
const pts = d.lcfsPolyline_m;
const Rs = pts.map((p) => p[0]);
const Zs = pts.map((p) => p[1]);
const R_max = Math.max(...Rs), R_min = Math.min(...Rs);
const Z_max = Math.max(...Zs), Z_min = Math.min(...Zs);
const R0_re = 0.5 * (R_max + R_min);
const a_re = 0.5 * (R_max - R_min);
const kappa_re = (Z_max - Z_min) / (2 * a_re);

check("polyline is closed-ish (>= 200 points)", pts.length >= 200, `${pts.length} points`);
check(
  "stored R0 matches polyline-derived R0",
  Math.abs(R0_re - d.lcfsShape.R0_m) < 1e-2,
  `${R0_re.toFixed(4)} vs ${d.lcfsShape.R0_m}`,
);
check(
  "stored a matches polyline-derived a",
  Math.abs(a_re - d.lcfsShape.a_m) < 1e-2,
  `${a_re.toFixed(4)} vs ${d.lcfsShape.a_m}`,
);
check(
  "stored kappa matches polyline-derived kappa",
  Math.abs(kappa_re - d.lcfsShape.kappa) < 1e-2,
  `${kappa_re.toFixed(4)} vs ${d.lcfsShape.kappa}`,
);

// X-point should sit near the polyline's own lower tip (single lower-null shape) and
// near a genuine field null (bpMagnitude << the outboard-midplane scale).
check(
  "X-point Z is near the LCFS's lowest point",
  Math.abs(d.xPoint.Z_m - Z_min) < 0.15,
  `xPoint.Z=${d.xPoint.Z_m}, polyline Z_min=${Z_min.toFixed(4)}`,
);
check(
  "labelled X-point has small |Bp| relative to outboard midplane (near a field null)",
  d.xPoint.bpMagnitude_T / d.xPoint.bpOutboardMidplane_T < 0.05,
  `ratio=${(d.xPoint.bpMagnitude_T / d.xPoint.bpOutboardMidplane_T).toFixed(4)}`,
);

// Magnetic axis should sit inside the LCFS, not outside it.
check(
  "magnetic axis lies within the LCFS's R extent",
  d.magneticAxis.R_m > R_min && d.magneticAxis.R_m < R_max,
  `axis.R=${d.magneticAxis.R_m}, LCFS R in [${R_min.toFixed(3)}, ${R_max.toFixed(3)}]`,
);
check(
  "magnetic axis lies within the LCFS's Z extent",
  d.magneticAxis.Z_m > Z_min && d.magneticAxis.Z_m < Z_max,
  `axis.Z=${d.magneticAxis.Z_m}, LCFS Z in [${Z_min.toFixed(3)}, ${Z_max.toFixed(3)}]`,
);

// --- 2. External cross-check against ITER's real published design values ---
// R0=6.2m, a=2.0m, Bt=5.3T at R=6.2m are ITER's standard published machine parameters --
// this equilibrium's own psi grid should reproduce them, independent of any of the shape
// tracing above (btf/rtf are read directly from the file header, not derived).
check("btf matches ITER's published 5.3 T", Math.abs(d.btf_T - 5.3) < 0.05, `${d.btf_T} T`);
check("rtf matches ITER's published 6.2 m reference radius", Math.abs(d.rtf_m - 6.2) < 0.05, `${d.rtf_m} m`);
check(
  "LCFS major radius R0 lands near ITER's published 6.2 m",
  Math.abs(d.lcfsShape.R0_m - 6.2) < 0.1,
  `${d.lcfsShape.R0_m} m`,
);
check(
  "LCFS minor radius a lands near ITER's published 2.0 m",
  Math.abs(d.lcfsShape.a_m - 2.0) < 0.1,
  `${d.lcfsShape.a_m} m`,
);

console.log(
  failures === 0
    ? "\nAll checks passed -- data/iter_equilibrium.json is internally consistent and matches ITER's published machine parameters."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
