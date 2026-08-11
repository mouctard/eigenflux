// Glue: preset selection -> worker solve -> canvas render.
import { SHAPE_PRESETS } from "../geom/boundary.js";
import { PROFILE_PRESETS, buildPressureProfile } from "../profiles/presets.js";
import { renderEquilibrium } from "./render.js";
import { buildPresetButtons, setActive, wireHowItWorks, wireKeyboardShortcuts } from "./ui.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const meshToggle = document.getElementById("mesh-toggle");

const worker = new Worker(new URL("../worker/solver.worker.js", import.meta.url), { type: "module" });

const shapeKeys = Object.keys(SHAPE_PRESETS);
const profileKeys = Object.keys(PROFILE_PRESETS);
const SHAPE_HOTKEYS = ["1", "2", "3"];
const PROFILE_HOTKEYS = ["q", "w", "e", "r"];

// Shareable state via URL fragment, e.g. #shape=iterLike&profile=highBeta -- mirrors
// eigendrum's #p=circle.
function parseHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const shapeKey = params.get("shape");
  const profileKey = params.get("profile");
  return {
    shapeKey: shapeKeys.includes(shapeKey) ? shapeKey : shapeKeys[0],
    profileKey: profileKeys.includes(profileKey) ? profileKey : profileKeys[0],
  };
}

function updateHash() {
  history.replaceState(null, "", `#shape=${state.shapeKey}&profile=${state.profileKey}`);
}

const state = parseHash();
let lastResult = null;

const shapeButtons = buildPresetButtons(
  document.getElementById("shape-presets"),
  SHAPE_PRESETS,
  (key) => {
    state.shapeKey = key;
    setActive(shapeButtons, key);
    updateHash();
    solve();
  },
  state.shapeKey,
  SHAPE_HOTKEYS
);

const profileButtons = buildPresetButtons(
  document.getElementById("profile-presets"),
  PROFILE_PRESETS,
  (key) => {
    state.profileKey = key;
    setActive(profileButtons, key);
    updateHash();
    solve();
  },
  state.profileKey,
  PROFILE_HOTKEYS
);

wireHowItWorks(document.getElementById("how-toggle"), document.getElementById("how-panel"));

wireKeyboardShortcuts({
  ...Object.fromEntries(SHAPE_HOTKEYS.map((k, i) => [k, () => shapeButtons[shapeKeys[i]].click()])),
  ...Object.fromEntries(PROFILE_HOTKEYS.map((k, i) => [k, () => profileButtons[profileKeys[i]].click()])),
});

meshToggle.addEventListener("change", () => {
  state.showMesh = meshToggle.checked;
  redraw();
});

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
  lastResult = data;
  redraw();

  statusEl.textContent =
    `${SHAPE_PRESETS[data.shapeKey].label} / ${PROFILE_PRESETS[data.profileKey].label} — ` +
    `Picard: ${data.iterations} iterations, residual ${data.residual.toExponential(2)}, ` +
    `ψ_axis = ${data.psiAxis.toFixed(3)}`;
};

function redraw() {
  if (!lastResult) return;
  const mesh = { nodes: lastResult.nodes, triangles: lastResult.triangles, boundaryNodes: lastResult.boundaryNodes };
  const pressureField = buildPressureProfile(PROFILE_PRESETS[lastResult.profileKey]);
  renderEquilibrium(ctx, canvas, mesh, lastResult.psi, pressureField, lastResult.psiAxis, {
    showMesh: state.showMesh,
  });
}

function solve() {
  statusEl.textContent = "Solving…";
  worker.postMessage({ shapeKey: state.shapeKey, profileKey: state.profileKey, nRho: 26, nTheta: 72 });
}

resizeCanvas();
updateHash();
solve();
