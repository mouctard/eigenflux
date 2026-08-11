// Tiny hand-written recursive-descent parser/evaluator for single-variable expressions in
// `theta`, used by the custom tokamak boundary input (src/geom/boundary.js). No `eval`/
// `Function` and no dependency -- keeps this project's "no dependencies, no build step"
// invariant (see index.html's how-it-works panel) even for user-supplied formulas.
//
// Grammar (standard precedence, '^' right-associative and binding tighter than unary minus,
// matching JS/math convention so "-2^2" === -4, not 4):
//   expr   := term (('+' | '-') term)*
//   term   := unary (('*' | '/') unary)*
//   unary  := ('-' | '+') unary | power
//   power  := atom ('^' unary)?
//   atom   := NUMBER | 'pi' | 'theta' | FUNC '(' expr ')' | '(' expr ')'
//   FUNC   := sin | cos | tan | sqrt | abs | exp

const FUNCS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
};

function tokenize(source) {
  const tokens = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if ("+-*/^()".includes(c)) {
      tokens.push({ type: c, value: c });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(source[j])) j++;
      // optional exponent, e.g. 1e-3
      if (j < n && (source[j] === "e" || source[j] === "E")) {
        let k = j + 1;
        if (k < n && (source[k] === "+" || source[k] === "-")) k++;
        if (k < n && /[0-9]/.test(source[k])) {
          j = k;
          while (j < n && /[0-9]/.test(source[j])) j++;
        }
      }
      const text = source.slice(i, j);
      const value = Number(text);
      if (!Number.isFinite(value)) throw new Error(`bad number "${text}"`);
      tokens.push({ type: "number", value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[a-zA-Z0-9_]/.test(source[j])) j++;
      tokens.push({ type: "ident", value: source.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`unexpected character "${c}" at position ${i}`);
  }
  return tokens;
}

// Recursive-descent parser producing a closure (theta) => number directly (no separate AST
// pass -- safe because every branch is built from a fixed, whitelisted set of JS operations,
// never from the user's text).
function parseExpr(source) {
  const tokens = tokenize(source);
  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  function next() {
    return tokens[pos++];
  }
  function expect(type) {
    const t = next();
    if (!t || t.type !== type) {
      throw new Error(`expected "${type}" but got ${t ? `"${t.value}"` : "end of expression"}`);
    }
    return t;
  }

  function parseExprLevel() {
    let left = parseTerm();
    for (;;) {
      const t = peek();
      if (t && (t.type === "+" || t.type === "-")) {
        next();
        const right = parseTerm();
        const op = t.type;
        const prevLeft = left;
        left = (theta) => (op === "+" ? prevLeft(theta) + right(theta) : prevLeft(theta) - right(theta));
      } else break;
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t && (t.type === "*" || t.type === "/")) {
        next();
        const right = parseUnary();
        const op = t.type;
        const prevLeft = left;
        left = (theta) => (op === "*" ? prevLeft(theta) * right(theta) : prevLeft(theta) / right(theta));
      } else break;
    }
    return left;
  }

  function parseUnary() {
    const t = peek();
    if (t && (t.type === "-" || t.type === "+")) {
      next();
      const inner = parseUnary();
      return t.type === "-" ? (theta) => -inner(theta) : inner;
    }
    return parsePower();
  }

  function parsePower() {
    const base = parseAtom();
    const t = peek();
    if (t && t.type === "^") {
      next();
      const exponent = parseUnary(); // right-assoc, and binds tighter than unary minus on the LHS
      return (theta) => Math.pow(base(theta), exponent(theta));
    }
    return base;
  }

  function parseAtom() {
    const t = next();
    if (!t) throw new Error("unexpected end of expression");
    if (t.type === "number") {
      const v = t.value;
      return () => v;
    }
    if (t.type === "(") {
      const inner = parseExprLevel();
      expect(")");
      return inner;
    }
    if (t.type === "ident") {
      const name = t.value;
      if (name === "pi") return () => Math.PI;
      if (name === "theta") return (theta) => theta;
      if (Object.prototype.hasOwnProperty.call(FUNCS, name)) {
        expect("(");
        const arg = parseExprLevel();
        expect(")");
        const fn = FUNCS[name];
        return (theta) => fn(arg(theta));
      }
      throw new Error(`unknown identifier "${name}" (allowed: theta, pi, ${Object.keys(FUNCS).join(", ")})`);
    }
    throw new Error(`unexpected token "${t.value}"`);
  }

  const fn = parseExprLevel();
  if (pos < tokens.length) {
    throw new Error(`unexpected token "${tokens[pos].value}" after end of expression`);
  }
  return fn;
}

// Compiles `source` (a function of `theta`) into a callable (theta) => number. Throws a
// descriptive Error on malformed input or unknown identifiers -- never falls back to eval.
export function compileExpr(source) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new Error("expression is empty");
  }
  const fn = parseExpr(source);
  // Fail fast on a bad expression (e.g. sqrt(-1) is finite-but-NaN, division by literal zero
  // is Infinity) rather than letting it surface later as a confusing meshing error.
  const probe = fn(0);
  if (typeof probe !== "number" || Number.isNaN(probe)) {
    throw new Error("expression does not evaluate to a number");
  }
  return fn;
}
