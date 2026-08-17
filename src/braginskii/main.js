// Page glue for braginskii.html: worker lifecycle, field-selector/parameter wiring, and
// the render loop. Mirrors src/app/main.js's role for index.html, at far smaller scope.
import { buildPresetButtons, setActive } from "../app/ui.js";
import { wireThemeToggle } from "../app/theme.js";
import { renderField } from "./render.js";

const canvas = document.getElementById("canvas");
const ctx2d = canvas.getContext("2d");
const statusEl = document.getElementById("status");

const FIELD_PRESETS = {
  n: { label: "Density n" },
  Ti: { label: "Ion temperature Tᵢ" },
  Te: { label: "Electron temperature Tₑ" },
};
let fieldKey = "Te";
const fieldButtons = buildPresetButtons(
  document.getElementById("field-presets"),
  FIELD_PRESETS,
  (key) => { fieldKey = key; setActive(fieldButtons, key); redraw(); },
  fieldKey,
  [],
);

const meshToggle = document.getElementById("mesh-toggle");
const playToggle = document.getElementById("play-toggle");
const stepBtn = document.getElementById("step-btn");
const resetBtn = document.getElementById("reset-btn");
const coreNInput = document.getElementById("core-n-input");
const coreTInput = document.getElementById("core-t-input");
const dPerpInput = document.getElementById("dperp-input");
const chiPerpInput = document.getElementById("chiperp-input");
const deltaI1Input = document.getElementById("deltai1-input");
const gammaEInput = document.getElementById("gammae-input");

try {
  const themeToggleInput = document.getElementById("theme-toggle-input");
  if (themeToggleInput) wireThemeToggle(themeToggleInput);
} catch (e) {
  console.error("Theme toggle wiring failed:", e);
}

function currentParams() {
  return {
    nRho: 22,
    nTheta: 48,
    dt: 2e-7,
    coreRingFrac: 0.15,
    coreN: parseFloat(coreNInput.value) * 1e19,
    coreT: parseFloat(coreTInput.value),
    dPerp: parseFloat(dPerpInput.value),
    chiPerp: parseFloat(chiPerpInput.value),
    deltaI1: parseFloat(deltaI1Input.value),
    gammaE: parseFloat(gammaEInput.value),
    muIonMasses: 2, // deuterium
  };
}

let worker = null;
let mesh = null;
let latestState = null;
let playing = false;
let stepCount = 0;

function startWorker() {
  if (worker) worker.terminate();
  worker = new Worker(new URL("../worker/braginskii.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "mesh") {
      mesh = { nodes: msg.nodes, triangles: msg.triangles, boundaryNodes: msg.boundaryNodes };
      statusEl.textContent = `Mesh ready: ${msg.nodes.length} nodes, ${msg.realWallPointCount} real wall points digitized from ITER divertor data.`;
    } else if (msg.type === "state") {
      latestState = { n: msg.n, Ti: msg.Ti, Te: msg.Te };
      stepCount++;
      redraw();
    } else if (msg.type === "error") {
      statusEl.textContent = `Error: ${msg.message}`;
      playing = false;
      playToggle.textContent = "▶ Play";
    }
  };
  playing = false;
  playToggle.textContent = "▶ Play";
  stepCount = 0;
  statusEl.textContent = "Building mesh and loading the real ITER equilibrium…";
  worker.postMessage({ type: "init", nRho: 22, nTheta: 48, params: currentParams() });
}

function redraw() {
  if (!mesh || !latestState) return;
  const field = latestState[fieldKey];
  const { min, max } = renderField(ctx2d, canvas, mesh, field, { showMesh: meshToggle.checked });
  const label = FIELD_PRESETS[fieldKey].label;
  const unit = fieldKey === "n" ? "m⁻³" : "eV";
  statusEl.textContent = `${label}: [${min.toExponential(2)}, ${max.toExponential(2)}] ${unit}  ·  step ${stepCount}`;
}

meshToggle.addEventListener("change", redraw);

playToggle.addEventListener("click", () => {
  playing = !playing;
  playToggle.textContent = playing ? "⏸ Pause" : "▶ Play";
  worker.postMessage({ type: playing ? "play" : "pause" });
});

stepBtn.addEventListener("click", () => {
  worker.postMessage({ type: "step", n: 4 });
});

resetBtn.addEventListener("click", startWorker);

for (const input of [coreNInput, coreTInput, dPerpInput, chiPerpInput, deltaI1Input, gammaEInput]) {
  input.addEventListener("change", () => {
    if (worker) worker.postMessage({ type: "setParams", params: currentParams() });
  });
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.max(320, Math.min(rect.width, 720));
  canvas.width = size;
  canvas.height = size;
  redraw();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

startWorker();
