// Re-verifies data/iter_equilibrium.json's wallArc from scratch -- the same "consecutive
// steps stay small" and "shape lands where a real divertor should be" checks used to pick
// this run out of the raw (non-single-polyline) node list in
// tools/export_iter_equilibrium.py's extract_real_wall_arc, re-run against the shipped
// JSON so a stale or hand-edited file can't silently drift from what was actually verified.
// Run with: node tools/validate_iter_wall.mjs
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

const pts = d.wallArc.points_m;
check("wallArc has a substantial number of points", pts.length >= 50, `${pts.length} points`);

let maxStep = 0, sumStep = 0;
for (let i = 0; i < pts.length - 1; i++) {
  const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
  const dist = Math.hypot(dx, dy);
  maxStep = Math.max(maxStep, dist);
  sumStep += dist;
}
const meanStep = sumStep / (pts.length - 1);
check(
  "no leftover big jump between disjoint source curves (max consecutive step stays small)",
  maxStep < 1.0,
  `max=${maxStep.toFixed(3)} m, mean=${meanStep.toFixed(3)} m`,
);

const Rs = pts.map((p) => p[0]);
const Zs = pts.map((p) => p[1]);
const R_min = Math.min(...Rs), R_max = Math.max(...Rs);
const Z_min = Math.min(...Zs), Z_max = Math.max(...Zs);

// The arc is known (by construction/inspection) to run from the outer-divertor-leg point
// down through the divertor floor, up the inboard wall, and over the top -- so it should
// reach deep (divertor floor, Z well below the X-point) and should NOT reach the far
// outboard side (R should stay well short of the vessel's outer wall/port structures,
// which live out past R~8m on this same raw node list).
check(
  "arc reaches down to the divertor floor, well below the real X-point (Z=-3.43 m)",
  Z_min < -4.0,
  `Z_min=${Z_min.toFixed(3)} m vs xPoint.Z=${d.xPoint.Z_m} m`,
);
check(
  "arc stays on the inboard/top side, short of the far-outboard vessel structures (~R>8m)",
  R_max < 7.0,
  `R_max=${R_max.toFixed(3)} m`,
);
check(
  "arc's inboard extent is plausible for ITER's real ~4m inboard wall",
  R_min > 3.5 && R_min < 4.5,
  `R_min=${R_min.toFixed(3)} m`,
);

check(
  "provenance fields present (source file, node-range within the raw list)",
  typeof d.wallArc.sourceFile === "string" && Array.isArray(d.wallArc.sourceNodeRange),
  `sourceFile=${d.wallArc.sourceFile}, sourceNodeRange=${JSON.stringify(d.wallArc.sourceNodeRange)}`,
);

const bg = d.backgroundGrid;
check(
  "background psi grid extends past the LCFS into real SOL/vacuum space",
  bg.r_m[0] < d.lcfsShape.R0_m - d.lcfsShape.a_m && bg.r_m[bg.r_m.length - 1] > d.lcfsShape.R0_m + d.lcfsShape.a_m,
  `r range=[${bg.r_m[0]}, ${bg.r_m[bg.r_m.length - 1]}] m vs LCFS R in [${(d.lcfsShape.R0_m - d.lcfsShape.a_m).toFixed(2)}, ${(d.lcfsShape.R0_m + d.lcfsShape.a_m).toFixed(2)}] m`,
);
check(
  "background psi grid dimensions match jm x km metadata",
  bg.psi.length === bg.km && bg.psi.every((row) => row.length === bg.jm),
  `psi is ${bg.psi.length} x ${bg.psi[0]?.length}, expected km=${bg.km} x jm=${bg.jm}`,
);

console.log(
  failures === 0
    ? "\nAll checks passed -- the shipped wall arc and background grid still match what was manually verified."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
