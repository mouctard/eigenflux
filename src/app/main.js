// Glue: preset selection -> worker solve -> canvas render -> live D-T burn simulation.
import { SHAPE_PRESETS } from "../geom/boundary.js";
import { PROFILE_PRESETS, buildPressureProfile } from "../profiles/presets.js";
import { createBurnModel, computeVolume } from "../fusion/burn.js";
import { FUSION_OPERATING_POINTS, E_DT_JOULES } from "../fusion/presets.js";
import { renderEquilibrium } from "./render.js";
import { buildPresetButtons, setActive, wireHowItWorks, wireKeyboardShortcuts } from "./ui.js";
import { formatTime, formatPower, formatEnergy, formatRate, formatDensity } from "./format.js";

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
    renderBurnState(performance.now());
  }, 150);
});

// ---- Live D-T burn simulation -----------------------------------------------------
// See index.html's "Live fuel burn" panel for the physics writeup. Every quantity below
// is a closed-form evaluation at the current elapsed simulated time -- no per-frame
// integration.

const dFillEl = document.getElementById("d-fill");
const tFillEl = document.getElementById("t-fill");
const dPctEl = document.getElementById("d-pct");
const tPctEl = document.getElementById("t-pct");
const dDensityEl = document.getElementById("d-density");
const tDensityEl = document.getElementById("t-density");
const statTimeEl = document.getElementById("stat-time");
const statPowerEl = document.getElementById("stat-power");
const statEnergyEl = document.getElementById("stat-energy");
const statRateEl = document.getElementById("stat-rate");
const burnToggleBtn = document.getElementById("burn-toggle");
const burnResetBtn = document.getElementById("burn-reset");
const burnSpeedSelect = document.getElementById("burn-speed");

const BURN_MODES = { deplete: { label: "Deplete" }, sustained: { label: "Sustained" } };
const BURN_MODE_HOTKEYS = ["d", "s"];

let burnModel = null;
let burnMode = "deplete";
let burnSpeed = Number(burnSpeedSelect.value);
let burnPlaying = false;
let burnElapsedSim = 0;
let burnLastFrameReal = null;
let rafHandle = null;
let lastRedrawReal = 0;
const REDRAW_INTERVAL_MS = 66; // ~15 Hz -- plenty smooth for a slow glow pulse, cheap on the full-mesh redraw

const burnModeButtons = buildPresetButtons(
  document.getElementById("burn-mode-presets"),
  BURN_MODES,
  (key) => {
    burnMode = key;
    setActive(burnModeButtons, key);
    resetBurn();
  },
  burnMode,
  BURN_MODE_HOTKEYS
);

wireKeyboardShortcuts(
  Object.fromEntries(BURN_MODE_HOTKEYS.map((k, i) => [k, () => burnModeButtons[Object.keys(BURN_MODES)[i]].click()]))
);

burnSpeedSelect.addEventListener("change", () => {
  burnSpeed = Number(burnSpeedSelect.value);
});

burnToggleBtn.addEventListener("click", () => {
  setBurnPlaying(!burnPlaying);
});

burnResetBtn.addEventListener("click", () => {
  resetBurn();
});

function setBurnPlaying(playing) {
  burnPlaying = playing;
  burnToggleBtn.textContent = burnPlaying ? "⏸ Pause" : "▶ Play";
  if (burnPlaying) {
    burnLastFrameReal = performance.now();
    rafHandle = requestAnimationFrame(burnTick);
  } else if (rafHandle) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
}

function resetBurn() {
  burnElapsedSim = 0;
  burnLastFrameReal = performance.now();
  renderBurnState(performance.now());
}

function burnTick(now) {
  if (!burnPlaying) return;
  const dtReal = (now - burnLastFrameReal) / 1000;
  burnLastFrameReal = now;
  burnElapsedSim += Math.max(0, dtReal) * burnSpeed;

  if (now - lastRedrawReal >= REDRAW_INTERVAL_MS) {
    lastRedrawReal = now;
    renderBurnState(now);
  }
  rafHandle = requestAnimationFrame(burnTick);
}

function renderBurnState(now) {
  if (!burnModel) return;
  const { n, P, E } = burnModel.at(burnElapsedSim, burnMode);
  const frac = burnModel.n0_m3 > 0 ? Math.max(0, Math.min(1, n / burnModel.n0_m3)) : 0;
  const pct = Math.round(frac * 100);

  dFillEl.style.width = pct + "%";
  tFillEl.style.width = pct + "%";
  dPctEl.textContent = pct + "%";
  tPctEl.textContent = pct + "%";
  dDensityEl.textContent = formatDensity(n);
  tDensityEl.textContent = formatDensity(n);

  statTimeEl.textContent = formatTime(burnElapsedSim);
  statPowerEl.textContent = formatPower(P);
  statEnergyEl.textContent = formatEnergy(E);
  statRateEl.textContent = formatRate(P / E_DT_JOULES);

  const powerLevel = burnModel.P0 > 0 ? P / burnModel.P0 : 0;
  const pulseHz = 0.3 + 1.2 * powerLevel;
  state.glow = burnPlaying ? { powerLevel, pulsePhase: (now / 1000) * pulseHz * 2 * Math.PI } : null;
  redraw();
}

// ---- Equilibrium solve --------------------------------------------------------------

worker.onmessage = (e) => {
  const data = e.data;
  if (data.shapeKey !== state.shapeKey || data.profileKey !== state.profileKey) return; // stale response
  lastResult = data;

  const mesh = { nodes: data.nodes, triangles: data.triangles, boundaryNodes: data.boundaryNodes };
  const volume_m3 = computeVolume(mesh);
  const op = FUSION_OPERATING_POINTS[data.profileKey];
  burnModel = createBurnModel({ T_keV: op.T_keV, n0_m3: op.n0_m3, volume_m3 });

  setBurnPlaying(false);
  burnElapsedSim = 0;
  renderBurnState(performance.now());

  statusEl.textContent =
    `${SHAPE_PRESETS[data.shapeKey].label} / ${PROFILE_PRESETS[data.profileKey].label} — ` +
    `Picard: ${data.iterations} iterations, residual ${data.residual.toExponential(2)}, ` +
    `ψ_axis = ${data.psiAxis.toFixed(3)}, V = ${volume_m3.toFixed(0)} m³`;
};

function redraw() {
  if (!lastResult) return;
  const mesh = { nodes: lastResult.nodes, triangles: lastResult.triangles, boundaryNodes: lastResult.boundaryNodes };
  const pressureField = buildPressureProfile(PROFILE_PRESETS[lastResult.profileKey]);
  renderEquilibrium(ctx, canvas, mesh, lastResult.psi, pressureField, lastResult.psiAxis, {
    showMesh: state.showMesh,
    glow: state.glow || null,
  });
}

function solve() {
  statusEl.textContent = "Solving…";
  worker.postMessage({ shapeKey: state.shapeKey, profileKey: state.profileKey, nRho: 26, nTheta: 72 });
}

resizeCanvas();
updateHash();
solve();
