# eigenflux

A live Grad–Shafranov solver for tokamak MHD equilibria, running entirely in the browser.
Inspired by [eigendrum](https://baselashraf81.github.io/eigendrum/): a real PDE, solved
with finite elements in a Web Worker, rendered on a canvas — no dependencies, no build
step, no backend.

## What it does

Solves the fixed-boundary Grad–Shafranov equation for a chosen plasma boundary shape
(circular / ITER-like / spherical tokamak) and steady-state pressure/current profile
(low-β / high-β / peaked current / broad current), via Picard-iterated P1 finite elements
on a structured O-grid mesh. Renders the resulting flux surfaces and pressure field live.

See the "How this works" panel on the page itself for the physics, the deliberate
simplifications (fixed boundary, no eigensolver needed), and validation against the
closed-form Solov'ev equilibrium.

## Run it

No build step — open `index.html` directly, or serve the directory statically:

```
python3 -m http.server 8000
```

## Validate the solver

```
node tools/validate_solovev.mjs
```

Reports L2 error against the closed-form Solov'ev equilibrium at increasing mesh
resolutions; should show clean second-order convergence.

## Structure

```
index.html
styles/style.css
src/
  math/     sparse CSR matrix, Jacobi-preconditioned CG
  geom/     Miller boundary parametrization, O-grid mesher
  fem/      P1 assembly, Picard equilibrium driver, Solov'ev closed form
  profiles/ pressure/current profile presets
  app/      contour extraction, canvas rendering, UI wiring
  worker/   off-main-thread solve
tools/      validate_solovev.mjs
```

## Status

Tokamaks only, fixed-boundary. Stellarators (inherently 3D) and safety-factor/q-profile
diagnostics are planned as follow-ups, not covered here.

## License

MIT
