// Glue: preset selection -> worker solve -> canvas render.
import { SHAPE_PRESETS } from "../geom/boundary.js";
import { PROFILE_PRESETS, buildPressureProfile } from "../profiles/presets.js";
import { renderEquilibrium } from "./render.js";
import { buildPresetButtons, setActive, wireHowItWorks } from "./ui.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

const worker = new Worker(new URL("../worker/solver.worker.js", import.meta.url), { type: "module" });

const state = { shapeKey: "circular", profileKey: "lowBeta" };

const shapeButtons = buildPresetButtons(
  document.getElementById("shape-presets"),
  SHAPE_PRESETS,
  (key) => {
    state.shapeKey = key;
    setActive(shapeButtons, key);
    solve();
  },
  state.shapeKey
);

const profileButtons = buildPresetButtons(
  document.getElementById("profile-presets"),
  PROFILE_PRESETS,
  (key) => {
    state.profileKey = key;
    setActive(profileButtons, key);
    solve();
  },
  state.profileKey
);

wireHowItWorks(document.getElementById("how-toggle"), document.getElementById("how-panel"));

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.max(320, Math.min(rect.width, 720));
  canvas.width = size;
  canvas.height = size;
}
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeCanvas();
    solve();
  }, 150);
});

worker.onmessage = (e) => {
  const data = e.data;
  if (data.shapeKey !== state.shapeKey || data.profileKey !== state.profileKey) return; // stale response

  const mesh = { nodes: data.nodes, triangles: data.triangles, boundaryNodes: data.boundaryNodes };
  const pressureField = buildPressureProfile(PROFILE_PRESETS[data.profileKey]);
  renderEquilibrium(ctx, canvas, mesh, data.psi, pressureField, data.psiAxis);

  statusEl.textContent =
    `${SHAPE_PRESETS[data.shapeKey].label} / ${PROFILE_PRESETS[data.profileKey].label} — ` +
    `Picard: ${data.iterations} iterations, residual ${data.residual.toExponential(2)}, ` +
    `ψ_axis = ${data.psiAxis.toFixed(3)}`;
};

function solve() {
  statusEl.textContent = "Solving…";
  worker.postMessage({ shapeKey: state.shapeKey, profileKey: state.profileKey, nRho: 26, nTheta: 72 });
}

resizeCanvas();
solve();
