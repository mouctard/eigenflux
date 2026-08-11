# eigenflux

Two live views into magnetically confined fusion plasmas, running entirely in the browser.
Inspired by [eigendrum](https://baselashraf81.github.io/eigendrum/): real physics, solved
or loaded client-side, rendered on canvas/WebGL — no build step, no backend.

## Tokamak Grad–Shafranov solver (`index.html`)

Solves the fixed-boundary Grad–Shafranov equation live, for a chosen plasma boundary shape
(circular / ITER-like / spherical tokamak) and steady-state pressure/current profile
(low-β / high-β / peaked current / broad current), via Picard-iterated P1 finite elements
on a structured O-grid mesh, in a Web Worker. Shareable via URL (`#shape=...&profile=...`),
keyboard shortcuts (`1`/`2`/`3` for shape, `Q`/`W`/`E`/`R` for profile), mesh-visibility
toggle. See its "How this works" panel for the physics, the deliberate simplifications
(fixed boundary, no eigensolver needed), and validation against the closed-form Solov'ev
equilibrium.

## Stellarator flux-surface viewer (`stellarator.html`)

Renders nested 3D flux surfaces for three real stellarators — Wendelstein 7-X, HSX, NCSX —
from **precomputed, DESC-solved equilibria** (not solved live; see its "How this works"
panel for why 3D MHD equilibria aren't a live-in-browser problem, and where the data
actually comes from). Orbit-controllable 3D view via a vendored copy of three.js.

## Run it

No build step for either page — open `index.html` / `stellarator.html` directly, or serve
the directory statically:

```
python3 -m http.server 8000
```

## Validate the tokamak solver

```
node tools/validate_solovev.mjs
```

Reports L2 error against the closed-form Solov'ev equilibrium at increasing mesh
resolutions; should show clean second-order convergence.

## Re-export stellarator data

Requires a Python env with `desc-opt` installed (heavy: pulls in JAX and several
native-extension packages, so it's worth a dedicated env):

```
conda create -n desc python=3.11
conda activate desc
pip install desc-opt
python tools/export_stellarators.py
```

Downloads precomputed equilibria from the [DESC repo](https://github.com/PlasmaControl/DESC/tree/master/desc/examples)
and writes compact binaries to `data/stellarators/*.bin`.

## Structure

```
index.html            tokamak page
stellarator.html       3D stellarator viewer
styles/style.css       shared styling
src/
  math/                sparse CSR matrix, Jacobi-preconditioned CG
  geom/                Miller boundary parametrization, O-grid mesher
  fem/                 P1 assembly, Picard equilibrium driver, Solov'ev closed form
  profiles/            pressure/current profile presets
  app/                 contour extraction, canvas rendering, colormap, UI wiring
  worker/              off-main-thread tokamak solve
  stellarator/         .bin loader, three.js viewer, page glue
tools/
  validate_solovev.mjs      tokamak solver validation
  export_stellarators.py    stellarator data export (see above)
data/stellarators/     exported .bin flux-surface data (committed, ~144KB each)
vendor/three/          vendored three.js (MIT) -- the one dependency, not CDN-loaded
```

## Deploy

Hosted as a plain static site on GitHub Pages, serving from the repo root of `main`.
`.nojekyll` disables Jekyll processing (unneeded for a plain static site).

## Status

Tokamaks: fixed-boundary only (no free-boundary/coil solve). Stellarators: geometry only
(flux-surface shape from precomputed equilibria, not pressure/current profiles or
stability). Safety-factor/q-profile diagnostics and free-form shape drawing (like
eigendrum's) are natural next steps, not done here.

## License

MIT
