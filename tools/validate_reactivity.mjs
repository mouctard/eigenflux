// Cross-checks all four Bosch-Hale reactivity channels in src/fusion/reactivity.js against
// an independently reproduced copy of the paper's Table 6 (reaction rate data computed from
// the Table 5 coefficients): T.A. Heltemes, G.A. Moses, J.F. Santarius, "Analysis of an
// Improved Fusion Reaction Rate Model for Use in Fusion Plasma Simulations", UWFDM-1268,
// U. Wisconsin Fusion Technology Institute (2005), Table 6. Values there are in cm^3/s;
// this file's sigmaV functions return m^3/s (factor of 1e-6).
// Run with: node tools/validate_reactivity.mjs
import { sigmaV, sigmaVDDp, sigmaVDDn, sigmaVDHe3 } from "../src/fusion/reactivity.js";

// Table 6, columns T(d,n)4He | D(d,n)3He | D(d,p)T | DDtotal | 3He(D,p)4He, values in cm^3/s.
// (DDtotal column is skipped here -- it's just ddn+ddp, not independently useful to check.)
const TABLE6 = [
  { T: 1, dt: 6.86e-21, ddn: 9.93e-23, ddp: 1.02e-22, dhe3: 3.05e-26 },
  { T: 2, dt: 2.98e-19, ddn: 3.11e-21, ddp: 3.15e-21, dhe3: 1.4e-23 },
  { T: 5, dt: 1.37e-17, ddn: 9.13e-20, ddp: 9.02e-20, dhe3: 6.36e-21 },
  { T: 10, dt: 1.14e-16, ddn: 6.02e-19, ddp: 5.78e-19, dhe3: 2.12e-19 },
  { T: 20, dt: 4.33e-16, ddn: 2.6e-18, ddp: 2.4e-18, dhe3: 3.48e-18 },
  { T: 50, dt: 8.65e-16, ddn: 1.13e-17, ddp: 9.84e-18, dhe3: 5.55e-17 },
  { T: 100, dt: 8.45e-16, ddn: 2.68e-17, ddp: 2.24e-17, dhe3: 1.72e-16 },
];

let failures = 0;
// Table entries are 3 sig figs, so allow ~1% + a small absolute floor for rounding.
function check(actual_m3, expected_cm3, label) {
  const expected_m3 = expected_cm3 * 1e-6;
  const relErr = Math.abs(actual_m3 - expected_m3) / expected_m3;
  const ok = relErr < 0.02;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${label}: got ${actual_m3.toExponential(3)} m^3/s, table ${expected_m3.toExponential(3)} m^3/s (${(relErr * 100).toFixed(2)}% off)`
  );
  if (!ok) failures++;
}

for (const row of TABLE6) {
  check(sigmaV(row.T), row.dt, `T(d,n)4He at ${row.T} keV`);
  check(sigmaVDDn(row.T), row.ddn, `D(d,n)3He at ${row.T} keV`);
  check(sigmaVDDp(row.T), row.ddp, `D(d,p)T at ${row.T} keV`);
  check(sigmaVDHe3(row.T), row.dhe3, `3He(d,p)4He at ${row.T} keV`);
}

// Original file's own verified comment values -- confirms the boschHale-factory refactor of
// the D-T channel didn't change its output.
const dt10 = sigmaV(10);
const dt65 = sigmaV(65);
console.log(`\nD-T refactor check: sigmaV(10)=${dt10.toExponential(4)} (expect ~1.136e-22), sigmaV(65)=${dt65.toExponential(4)} (expect ~8.94e-22, peak)`);
if (Math.abs(dt10 - 1.136e-22) / 1.136e-22 > 0.01) failures++;
if (Math.abs(dt65 - 8.94e-22) / 8.94e-22 > 0.02) failures++;

console.log(failures === 0 ? "\nAll channels match the reference table." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
