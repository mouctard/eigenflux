# Vendored three.js

`three.module.min.js`, `three.core.min.js` (a required companion file the module build
imports internally), and `controls/OrbitControls.js`, pinned at **v0.185.1**, MIT licensed
(license header preserved in both files). Fetched once from unpkg and committed here so the
deployed page makes no external network requests at runtime — the one dependency in this
project, vendored rather than CDN-loaded.

Source: https://github.com/mrdoob/three.js (v0.185.1)

To update: re-download both files at a new pinned version and update this note.
