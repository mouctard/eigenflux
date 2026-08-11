// Glue: preset selection -> worker solve -> canvas render -> live D-T burn simulation.
import { SHAPE_PRESETS, validateCustomBoundary } from "../geom/boundary.js";
import { PROFILE_PRESETS, buildPressureProfile } from "../profiles/presets.js";
import { FUEL_PRESETS } from "../fusion/fuels.js";
import { CAPTURE_PRESETS, convertToElectric } from "../fusion/capture.js";
import { createBurnModel, computeVolume } from "../fusion/burn.js";
import { FUSION_OPERATING_POINTS } from "../fusion/presets.js";
import { compileExpr } from "../math/exprParser.js";
import { renderEquilibrium } from "./render.js";
import { renderBurnChart } from "./burnChart.js";
import { createTokamakViewer } from "./tokamak3d.js";
import { buildPresetButtons, setActive, wireHowItWorks, wireKeyboardShortcuts, buildFuelGauges } from "./ui.js";
import { formatTime, formatPower, formatEnergy, formatRate, formatDensity } from "./format.js";
import { paintLegendBar } from "./legend.js";

const SOLVE_NRHO = 26;
const SOLVE_NTHETA = 72;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const storyLink = document.getElementById("story-link");
const viewer3d = createTokamakViewer(document.getElementById("viewer3d"));

paintLegendBar(document.getElementById("pressure-legend"));
const meshToggle = document.getElementById("mesh-toggle");

const worker = new Worker(new URL("../worker/solver.worker.js", import.meta.url), { type: "module" });

const shapeKeys = Object.keys(SHAPE_PRESETS);
const profileKeys = Object.keys(PROFILE_PRESETS);
const fuelKeys = Object.keys(FUEL_PRESETS);
const captureKeys = Object.keys(CAPTURE_PRESETS);
const SHAPE_HOTKEYS = ["1", "2", "3"];
const CUSTOM_SHAPE_HOTKEY = "4";
const PROFILE_HOTKEYS = ["q", "w", "e", "r"];
const FUEL_HOTKEYS = ["z", "x", "c"];
const CAPTURE_HOTKEYS = ["a", "f"];
const DEFAULT_CUSTOM_EXPR = "1 + 0.3*cos(3*theta)";

// Chart horizon presets -- UI-only (not physics), so defined here rather than in src/fusion/.
const TIMEFRAME_PRESETS = {
  h6: { label: "6h", seconds: 6 * 3600 },
  h12: { label: "12h", seconds: 12 * 3600 },
  h24: { label: "24h", seconds: 24 * 3600 },
};
const timeframeKeys = Object.keys(TIMEFRAME_PRESETS);
const TIMEFRAME_HOTKEYS = ["g", "h", "j"];

// Shareable state via URL fragment, e.g. #shape=iterLike&profile=highBeta&fuel=dt&capture=blanketSteam
// -- mirrors eigendrum's #p=circle. A custom shape adds &r=<encoded r(theta) expression>.
function parseHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const shapeParam = params.get("shape");
  const profileKey = params.get("profile");
  const fuelKey = params.get("fuel");
  const captureKey = params.get("capture");
  const timeframeKey = params.get("horizon");
  const isCustomShape = shapeParam === "custom";
  return {
    shapeKey: isCustomShape ? "custom" : shapeKeys.includes(shapeParam) ? shapeParam : shapeKeys[0],
    customExpr: (isCustomShape && params.get("r")) || DEFAULT_CUSTOM_EXPR,
    profileKey: profileKeys.includes(profileKey) ? profileKey : profileKeys[0],
    fuelKey: fuelKeys.includes(fuelKey) ? fuelKey : fuelKeys[0],
    captureKey: captureKeys.includes(captureKey) ? captureKey : captureKeys[0],
    timeframeKey: timeframeKeys.includes(timeframeKey) ? timeframeKey : timeframeKeys[0],
  };
}

function updateHash() {
  const parts = [
    `shape=${state.shapeKey}`,
    `profile=${state.profileKey}`,
    `fuel=${state.fuelKey}`,
    `capture=${state.captureKey}`,
    `horizon=${state.timeframeKey}`,
  ];
  if (state.shapeKey === "custom") parts.push(`r=${encodeURIComponent(state.customExpr)}`);
  history.replaceState(null, "", `#${parts.join("&")}`);
  storyLink.href = `story.html#fuel=${state.fuelKey}&capture=${state.captureKey}`;
}

const state = parseHash();
let lastResult = null;
let lastVolume_m3 = null;
let lastOp = null;

const shapeButtons = buildPresetButtons(
  document.getElementById("shape-presets"),
  SHAPE_PRESETS,
  (key) => {
    state.shapeKey = key;
    setActive(shapeButtons, key);
    customShapeToggle.classList.remove("active");
    customShapePanel.hidden = true;
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

const fuelButtons = buildPresetButtons(
  document.getElementById("fuel-presets"),
  FUEL_PRESETS,
  (key) => {
    state.fuelKey = key;
    setActive(fuelButtons, key);
    updateHash();
    rebuildBurnModel();
  },
  state.fuelKey,
  FUEL_HOTKEYS
);

const captureButtons = buildPresetButtons(
  document.getElementById("capture-presets"),
  CAPTURE_PRESETS,
  (key) => {
    state.captureKey = key;
    setActive(captureButtons, key);
    updateHash();
    renderBurnState(performance.now());
  },
  state.captureKey,
  CAPTURE_HOTKEYS
);

const timeframeButtons = buildPresetButtons(
  document.getElementById("timeframe-presets"),
  TIMEFRAME_PRESETS,
  (key) => {
    state.timeframeKey = key;
    setActive(timeframeButtons, key);
    updateHash();
    renderBurnState(performance.now());
  },
  state.timeframeKey,
  TIMEFRAME_HOTKEYS
);

// ---- Custom equation-based shape ------------------------------------------------------
const customShapeToggle = document.getElementById("custom-shape-toggle");
const customShapePanel = document.getElementById("custom-shape-panel");
const customShapeInput = document.getElementById("custom-shape-input");
const customShapeError = document.getElementById("custom-shape-error");

customShapeInput.value = state.customExpr;
if (state.shapeKey === "custom") {
  customShapePanel.hidden = false;
  customShapeToggle.classList.add("active");
}

function applyCustomShape() {
  const expr = customShapeInput.value;
  let rFn;
  try {
    rFn = compileExpr(expr);
  } catch (e) {
    customShapeError.textContent = e.message;
    return;
  }
  const check = validateCustomBoundary(rFn);
  if (!check.ok) {
    customShapeError.textContent = check.reason;
    return;
  }
  customShapeError.textContent = "";
  state.shapeKey = "custom";
  state.customExpr = expr;
  setActive(shapeButtons, null);
  customShapeToggle.classList.add("active");
  updateHash();
  solve();
}

customShapeToggle.addEventListener("click", () => {
  if (customShapePanel.hidden) {
    customShapePanel.hidden = false;
    customShapeInput.focus();
    customShapeInput.select();
  } else {
    customShapePanel.hidden = true;
  }
});

customShapeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    applyCustomShape();
  }
});
customShapeInput.addEventListener("blur", applyCustomShape);

wireHowItWorks(document.getElementById("how-toggle"), document.getElementById("how-panel"));

wireKeyboardShortcuts({
  ...Object.fromEntries(SHAPE_HOTKEYS.map((k, i) => [k, () => shapeButtons[shapeKeys[i]].click()])),
  [CUSTOM_SHAPE_HOTKEY]: () => {
    customShapePanel.hidden = false;
    customShapeInput.focus();
    customShapeInput.select();
    applyCustomShape();
  },
  ...Object.fromEntries(PROFILE_HOTKEYS.map((k, i) => [k, () => profileButtons[profileKeys[i]].click()])),
  ...Object.fromEntries(FUEL_HOTKEYS.map((k, i) => [k, () => fuelButtons[fuelKeys[i]].click()])),
  ...Object.fromEntries(CAPTURE_HOTKEYS.map((k, i) => [k, () => captureButtons[captureKeys[i]].click()])),
  ...Object.fromEntries(TIMEFRAME_HOTKEYS.map((k, i) => [k, () => timeframeButtons[timeframeKeys[i]].click()])),
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

const statTimeEl = document.getElementById("stat-time");
const statPowerEl = document.getElementById("stat-power");
const statEnergyEl = document.getElementById("stat-energy");
const statRateEl = document.getElementById("stat-rate");
const statElectricPowerEl = document.getElementById("stat-electric-power");
const statElectricEnergyEl = document.getElementById("stat-electric-energy");
const burnChartCanvas = document.getElementById("burn-chart");
const burnChartCaption = document.getElementById("burn-chart-caption");
const burnToggleBtn = document.getElementById("burn-toggle");
const burnResetBtn = document.getElementById("burn-reset");
const burnSpeedSelect = document.getElementById("burn-speed");

const BURN_MODES = { deplete: { label: "Deplete" }, sustained: { label: "Sustained" } };
const BURN_MODE_HOTKEYS = ["d", "s"];

let burnModel = null;
let gaugeEls = buildFuelGauges(document.getElementById("fuel-gauges"), FUEL_PRESETS[state.fuelKey]);
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

// Rebuilds the burn model (and its fuel gauges) from the currently selected fuel, reusing the
// already-solved equilibrium's volume/operating point -- no fresh worker solve needed, since
// changing fuel doesn't change the plasma shape or steady-state profile.
function rebuildBurnModel() {
  if (lastVolume_m3 == null || lastOp == null) return;
  const fuel = FUEL_PRESETS[state.fuelKey];
  burnModel = createBurnModel({ fuel, T_keV: lastOp.T_keV, n0_m3: lastOp.n0_m3, volume_m3: lastVolume_m3 });
  gaugeEls = buildFuelGauges(document.getElementById("fuel-gauges"), fuel);
  setBurnPlaying(false);
  burnElapsedSim = 0;
  renderBurnState(performance.now());
}

function renderBurnState(now) {
  if (!burnModel) return;
  const { n, P, E } = burnModel.at(burnElapsedSim, burnMode);
  const frac = burnModel.n0_m3 > 0 ? Math.max(0, Math.min(1, n / burnModel.n0_m3)) : 0;
  const pct = Math.round(frac * 100);
  const densityText = formatDensity(n);

  for (const gauge of gaugeEls) {
    gauge.fillEl.style.width = pct + "%";
    gauge.pctEl.textContent = pct + "%";
    gauge.densityEl.textContent = densityText;
  }

  statTimeEl.textContent = formatTime(burnElapsedSim);
  statPowerEl.textContent = formatPower(P);
  statEnergyEl.textContent = formatEnergy(E);
  statRateEl.textContent = formatRate(burnModel.avgQ_J > 0 ? P / burnModel.avgQ_J : 0);

  const capture = CAPTURE_PRESETS[state.captureKey];
  const { P_electric, E_electric } = convertToElectric(P, E, burnModel, capture);
  statElectricPowerEl.textContent = formatPower(P_electric);
  statElectricEnergyEl.textContent = formatEnergy(E_electric);

  const powerLevel = burnModel.P0 > 0 ? P / burnModel.P0 : 0;
  const pulseHz = 0.3 + 1.2 * powerLevel;
  state.glow = burnPlaying ? { powerLevel, pulsePhase: (now / 1000) * pulseHz * 2 * Math.PI } : null;
  redraw();
  viewer3d.setGlow(state.glow);

  const horizonSeconds = TIMEFRAME_PRESETS[state.timeframeKey].seconds;
  const liveT = burnPlaying ? burnElapsedSim : null;
  const paybackT = renderBurnChart(burnChartCanvas, burnModel, burnMode, horizonSeconds, liveT);
  burnChartCaption.textContent =
    paybackT != null
      ? `At this rate, cumulative output reaches ITER's magnet energy (51 GJ) after ${formatTime(paybackT)}.`
      : `Cumulative output over ${TIMEFRAME_PRESETS[state.timeframeKey].label} doesn't reach ITER's magnet energy (51 GJ) at this rate.`;
}

// ---- Equilibrium solve --------------------------------------------------------------

worker.onmessage = (e) => {
  const data = e.data;
  if (data.shapeKey !== state.shapeKey || data.profileKey !== state.profileKey) return; // stale response

  if (data.error) {
    customShapeError.textContent = data.error;
    statusEl.textContent = `Error: ${data.error}`;
    return;
  }
  customShapeError.textContent = "";
  lastResult = data;

  const mesh = { nodes: data.nodes, triangles: data.triangles, boundaryNodes: data.boundaryNodes };
  lastVolume_m3 = computeVolume(mesh);
  lastOp = FUSION_OPERATING_POINTS[data.profileKey];
  rebuildBurnModel();
  viewer3d.setEquilibrium(mesh, SOLVE_NRHO, SOLVE_NTHETA);

  const shapeLabel = data.shapeKey === "custom" ? "Custom" : SHAPE_PRESETS[data.shapeKey].label;
  statusEl.textContent =
    `${shapeLabel} / ${PROFILE_PRESETS[data.profileKey].label} — ` +
    `Picard: ${data.iterations} iterations, residual ${data.residual.toExponential(2)}, ` +
    `ψ_axis = ${data.psiAxis.toFixed(3)}, V = ${lastVolume_m3.toFixed(0)} m³, ` +
    `mesh: ${data.nodes.length} nodes / ${data.triangles.length} tris`;
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
  worker.postMessage({
    shapeKey: state.shapeKey,
    profileKey: state.profileKey,
    nRho: SOLVE_NRHO,
    nTheta: SOLVE_NTHETA,
    customExpr: state.shapeKey === "custom" ? state.customExpr : undefined,
  });
}

resizeCanvas();
updateHash();
solve();
