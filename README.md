# eigenflux

Two live views into magnetically confined fusion plasmas, running entirely in the browser.
Inspired by [eigendrum](https://baselashraf81.github.io/eigendrum/): real physics, solved
or loaded client-side, rendered on canvas/WebGL — no build step, no backend.

## Tokamak Grad–Shafranov solver (`index.html`)

Solves the fixed-boundary Grad–Shafranov equation live, for a chosen plasma boundary shape
(circular / ITER-like / spherical tokamak / a custom shape typed as a polar equation
`r(θ)`) and steady-state pressure/current profile (low-β / high-β / peaked current / broad
current), via Picard-iterated P1 finite elements on a structured O-grid mesh, in a Web
Worker. On top of the solved equilibrium, a live 0D burn simulation runs across a choice of
fusion fuel (D-T / D-D / D-³He, real Bosch-Hale reactivities) and energy-capture technology
(blanket + steam turbine / direct conversion). Play doesn't just start a clock -- it energizes
the confining field, charging a real one-time activation-energy cost (ITER's 51 GJ magnet
system) that's tracked against cumulative electric output as an actual input/output energy
balance (the "net (out − activation)" stat tile, which starts negative and crosses zero at the
real breakeven point); Reset de-energizes the field and ends the shot, so the next Play pays
the cost again. The plasma visibly fades as fuel depletes, in both the 2D plot and the 3D view,
and the 3D magnet coils dim when the field is off. A "follow a single reaction" page walks
through one D-T/D-D/D-³He reaction particle-by-particle. A small 3D section revolves the live
2D solve into a torus with schematic magnet coils, orbit-controllable and pulsing with fusion
power alongside the 2D view while the reactor plays. Shareable via URL
(`#shape=...&profile=...&fuel=...&capture=...&op=...`), keyboard shortcuts (`1`-`4` for shape,
`Q`/`W`/`E`/`R` for profile, `Z`/`X`/`C` for fuel, `A`/`F` for capture method, `O`/`P` for
operating point), mesh-visibility toggle. See its "How this works" panel for the physics, the
deliberate simplifications (fixed boundary, no eigensolver needed), and validation against the
closed-form Solov'ev equilibrium.

A JET/DIII-D-style operational diagnostics dashboard, framed as an operator's control room
(ignite today's plasma, then watch the same numbers a real control room would), sits alongside
the 2D slice: B<sub>t</sub>, an H-mode/L-mode badge, β<sub>N</sub>, and q<sub>95</sub> near the
plot; a "Plasma parameters" block (I<sub>p</sub>, W<sub>th</sub>, H<sub>98</sub>, T<sub>e0</sub>,
n<sub>e</sub>, τ<sub>E</sub>, l<sub>i</sub>); a "Power and fusion" 0D power balance
(P<sub>OH</sub>/P<sub>NBI</sub>/P<sub>ECH</sub>/P<sub>ICH</sub>/P<sub>α</sub> in,
P<sub>rad</sub>/P<sub>loss</sub>/dW-dt out, P<sub>in</sub>/P<sub>out</sub> totals, plus a live
Martin08 H-mode threshold P<sub>LH</sub> caption); a "Divertor" panel (λ<sub>q</sub>,
f<sub>det</sub>, q<sub>i</sub>, T<sub>s</sub>); and a real-time scrolling "Shot trace" strip
chart. A new **Operating point** preset (`src/fusion/operatingPoints.js`, JET-scale /
DIII-D-scale) supplies the real-unit B<sub>t</sub>/I<sub>p</sub>/heating inputs the
arbitrary-unit solver can't provide on its own -- JET-scale reproduces real JET's field/current
envelope (the largest conventional tokamak ever built), DIII-D-scale reproduces real DIII-D's
(smaller, more agile, with a real ECH system JET's own heating mix never had); see the how-it-
works panel's "Plasma diagnostics" section for how that concretely changes the live IPB98(y,2)
confinement prediction. Most of the dashboard is genuinely derived, not
illustrative: internal inductance l<sub>i</sub> (a scale-invariant ratio of ⟨B<sub>θ</sub>²⟩),
thermal energy W<sub>th</sub> and β<sub>N</sub> (from the operating point's real n<sub>e</sub>/T
and the solved volume), τ<sub>E</sub>/H<sub>98</sub> (IPB98(y,2) scaling vs. the real
W<sub>th</sub>/P<sub>loss</sub> ratio), the H-mode gate (Martin08), and — as of this pass — the
**divertor block** too: λ<sub>q</sub> (Eich et al. 2013 regression), q<sub>i</sub> (real
poloidal-flux-expansion × grazing-incidence decomposition), f<sub>det</sub> (the real
P<sub>rad</sub>/(P<sub>rad</sub>+P<sub>loss</sub>) radiated-fraction proxy), and T<sub>s</sub>
(real 1D transient conduction into semi-infinite tungsten, using the shot's actual real elapsed
duration — it genuinely rises the longer a shot runs). Only P<sub>rad</sub>'s own formula and
the D-α trace remain honestly illustrative — see the how-it-works panel's "Approximations vs.
reality" table for the full breakdown, and `tools/validate_flux_diagnostics.mjs` /
`tools/validate_diagnostics.mjs` for what's checked. Play ramps the field/current/heating up
over ~1.4s and back down over ~1.1s on Pause/Reset (a `magnetRamp` state machine decoupled from
the fuel-burn clock, whose speed selector now goes down to 0.1× to watch the ramp in detail),
driving the whole dashboard and the 3D coil glow up and down with it, with a small illustrative
jitter/ELM-spike texture layered on top at flat-top.

The page is dark-themed by default (a small slider switches to light mode, persisted locally;
`src/app/theme.js`), responsive down to mobile widths, and has two header dropdowns: a
**Variables** glossary defining every symbol shown (with the actual defining formula, not just
an analogy) and an **FAQ** connecting the simulation to real-world scale — including a live
"homes powered" figure computed from the dashboard's own electric-power reading and the EIA's
real average U.S. household consumption figure.

## Stellarator flux-surface viewer (`stellarator.html`)

Renders nested 3D flux surfaces for three real stellarators — Wendelstein 7-X, HSX, NCSX —
from **precomputed, DESC-solved equilibria** (not solved live; see its "How this works"
panel for why 3D MHD equilibria aren't a live-in-browser problem, and where the data
actually comes from). Orbit-controllable 3D view via a vendored copy of three.js. Since
these flux surfaces already are a real solved 3D boundary (unlike the tokamak page's
fixed-boundary solve), a real enclosed plasma volume is computed directly from the mesh via
the divergence theorem, and drives the exact same fuel/energy-capture burn simulation as the
tokamak page — checked against a synthetic torus of known volume
(`tools/validate_stellarator_volume.mjs`) and cross-checked against a real published figure
(27.9 m³ computed vs. 30 m³ published for W7-X).

## Run it

No build step for either page — open `index.html` / `stellarator.html` directly, or serve
the directory statically:

```
python3 -m http.server 8000
```

## Validate the tokamak solver

```
node tools/validate_solovev.mjs             # closed-form Solov'ev convergence check
node tools/validate_custom_boundary.mjs     # same check through the equation-based boundary path
node tools/validate_expr_parser.mjs         # r(theta) expression parser correctness
node tools/validate_reactivity.mjs          # D-T/D-D/D-3He reactivities vs. a reference table
node tools/validate_stellarator_volume.mjs  # 3D mesh-volume formula vs. a synthetic torus
node tools/validate_flux_diagnostics.mjs    # l_i and boundary surface area vs. closed-form references
node tools/validate_diagnostics.mjs         # IPB98(y,2) tau_E, Martin08 P_LH, W_th/beta_N arithmetic
```

`validate_solovev.mjs` reports L2 error against the closed-form Solov'ev equilibrium at
increasing mesh resolutions; should show clean second-order convergence. The others check
the pieces added for equation-based custom shapes and multi-fuel burn simulation before
they're wired into the UI -- see index.html's "How this works" panel for what each one is
actually checking.

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
story.html             single-reaction narrative page (linked from index.html)
styles/style.css       shared styling
src/
  math/                sparse CSR matrix, Jacobi-preconditioned CG, r(theta) expression parser
  geom/                Miller + equation-based boundary parametrizations, O-grid mesher
  fem/                 P1 assembly, Picard equilibrium driver, Solov'ev closed form,
                        mesh/psi-derived diagnostics (internal inductance, surface area)
  profiles/            pressure/current profile presets (Grad-Shafranov steady states)
  fusion/               Bosch-Hale reactivities, fuel presets, 0D burn model, energy capture,
                        real-unit operating points, plasma/power-balance/divertor diagnostics
  app/                 contour extraction, canvas/3D rendering, colormap, burn/shot charts,
                        UI wiring, dark/light theme toggle
  worker/              off-main-thread tokamak solve
  stellarator/         .bin loader, three.js viewer, 3D mesh-volume calc, page glue
  story/               single-reaction narrative data + canvas animations
tools/
  validate_solovev.mjs             tokamak solver validation
  validate_custom_boundary.mjs     equation-based boundary path regression check
  validate_expr_parser.mjs         r(theta) expression parser correctness
  validate_reactivity.mjs          D-T/D-D/D-3He reactivity cross-check
  validate_stellarator_volume.mjs  3D mesh-volume formula vs. a synthetic torus
  validate_flux_diagnostics.mjs    internal inductance / surface area vs. closed-form references
  validate_diagnostics.mjs         IPB98(y,2)/Martin08/W_th-beta_N formula checks
  export_stellarators.py           stellarator data export (see above)
data/stellarators/     exported .bin flux-surface data (committed, ~144KB each)
vendor/three/          vendored three.js (MIT) -- the one dependency, not CDN-loaded
```

## Deploy

Hosted as a plain static site on GitHub Pages, serving from the repo root of `main`.
`.nojekyll` disables Jekyll processing (unneeded for a plain static site).

## Status

Tokamaks: fixed-boundary only (no free-boundary/coil solve), with an equation-based custom
boundary option (star-shaped curves only -- see the mesh comment in `src/geom/mesh.js` for
why free-hand drawing isn't offered). Stellarators: geometry only (flux-surface shape from
precomputed equilibria, not pressure/current profiles or stability). q_95 uses a large-aspect-
ratio approximation, not the exact flux-surface-averaged line integral (still a natural next
step); the divertor panel and D-alpha trace are explicitly illustrative, not verified physics.

## License

MIT
