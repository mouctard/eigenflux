// Correctness check for src/math/exprParser.js, run before it's ever wired into meshing.
// Run with: node tools/validate_expr_parser.mjs
import { compileExpr } from "../src/math/exprParser.js";

let failures = 0;

function assertClose(actual, expected, label, tol = 1e-9) {
  const err = Math.abs(actual - expected);
  const ok = err <= tol * Math.max(1, Math.abs(expected));
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: got ${actual}, expected ${expected}`);
  if (!ok) failures++;
}

function assertThrows(fn, label) {
  try {
    fn();
    console.log(`FAIL ${label}: expected an error, none thrown`);
    failures++;
  } catch (e) {
    console.log(`OK   ${label}: threw "${e.message}"`);
  }
}

assertClose(compileExpr("1 + 0.3*cos(3*theta)")(0), 1.3, "1 + 0.3*cos(3*theta) at theta=0");
assertClose(compileExpr("1 + 0.3*cos(3*theta)")(Math.PI / 3), 0.7, "1 + 0.3*cos(3*theta) at theta=pi/3");
assertClose(compileExpr("2^3")(0), 8, "2^3");
assertClose(compileExpr("-2^2")(0), -4, "-2^2 (unary minus binds looser than ^)");
assertClose(compileExpr("2^-1")(0), 0.5, "2^-1 (unary minus in exponent)");
assertClose(compileExpr("sqrt(4) + abs(-5)")(0), 7, "sqrt(4) + abs(-5)");
assertClose(compileExpr("sin(pi/2)")(0), 1, "sin(pi/2)");
assertClose(compileExpr("(1+2)*3")(0), 9, "(1+2)*3");
assertClose(compileExpr("1 - 0.4*sin(2*theta)")(Math.PI / 4), 0.6, "1 - 0.4*sin(2*theta) at theta=pi/4");
assertClose(compileExpr("2*theta + 1")(3), 7, "2*theta + 1 at theta=3");
assertClose(compileExpr("exp(0)")(0), 1, "exp(0)");
assertClose(compileExpr("tan(0)")(0), 0, "tan(0)");
assertClose(compileExpr("  1 + 1  ")(0), 2, "whitespace tolerance");
assertClose(compileExpr("1e-2 + 2E1")(0), 20.01, "scientific notation numbers");

assertThrows(() => compileExpr("theta + x"), "unknown identifier x");
assertThrows(() => compileExpr("1 +"), "trailing operator");
assertThrows(() => compileExpr("(1 + 2"), "unbalanced parens");
assertThrows(() => compileExpr("1 2"), "missing operator between tokens");
assertThrows(() => compileExpr(""), "empty expression");
assertThrows(() => compileExpr("alert(1)"), "disallowed identifier used as function");
assertThrows(() => compileExpr("theta; theta"), "disallowed character ;");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
