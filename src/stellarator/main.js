// Glue: config preset selection -> load precomputed surfaces -> 3D render -> live burn sim.
import { STELLARATOR_PRESETS, ILLUSTRATIVE_OPERATING_POINT } from "./presets.js";
import { loadSurfaces } from "./loadSurfaces.js";
import { createViewer } from "./viewer.js";
import { computeSurfaceVolume } from "./volume.js";
import { FUEL_PRESETS } from "../fusion/fuels.js";
import { CAPTURE_PRESETS, convertToElectric } from "../fusion/capture.js";
import { createBurnModel } from "../fusion/burn.js";
import { ITER_MAGNET_ENERGY_J } from "../fusion/activation.js";
import { renderBurnChart } from "../app/burnChart.js";
import { buildPresetButtons, setActive, wireHowItWorks, wireKeyboardShortcuts, buildFuelGauges } from "../app/ui.js";
import { formatTime, formatPower, formatEnergy, formatSignedEnergy, formatRate, formatDensity } from "../app/format.js";
import { paintLegendBar } from "../app/legend.js";

const container = document.getElementById("viewer");
const statusEl = document.getElementById("status");
const viewer = createViewer(container);

paintLegendBar(document.getElementById("depth-legend"));

const configKeys = Object.keys(STELLARATOR_PRESETS);
const fuelKeys = Object.keys(FUEL_PRESETS);
const captureKeys = Object.keys(CAPTURE_PRESETS);
const CONFIG_HOTKEYS = ["1", "2", "3"];
const FUEL_HOTKEYS = ["z", "x", "c"];
const CAPTURE_HOTKEYS = ["a", "f"];

const TIMEFRAME_PRESETS = {
  h6: { label: "6h", seconds: 6 * 3600 },
  h12: { label: "12h", seconds: 12 * 3600 },
  h24: { label: "24h", seconds: 24 * 3600 },
};
const timeframeKeys = Object.keys(TIMEFRAME_PRESETS);
const TIMEFRAME_HOTKEYS = ["g", "h", "j"];

function parseHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const configKey = params.get("config");
  const fuelKey = params.get("fuel");
  const captureKey = params.get("capture");
  const timeframeKey = params.get("horizon");
  return {
    configKey: configKeys.includes(configKey) ? configKey : configKeys[0],
    fuelKey: fuelKeys.includes(fuelKey) ? fuelKey : fuelKeys[0],
    captureKey: captureKeys.includes(captureKey) ? captureKey : captureKeys[0],
    timeframeKey: timeframeKeys.includes(timeframeKey) ? timeframeKey : timeframeKeys[0],
  };
}

function updateHash() {
  history.replaceState(
    null,
    "",
    `#config=${state.configKey}&fuel=${state.fuelKey}&capture=${state.captureKey}&horizon=${state.timeframeKey}`
  );
}

const state = parseHash();
let lastVolume_m3 = null;

async function selectConfig(key) {
  state.configKey = key;
  setActive(configButtons, key);
  updateHash();
  statusEl.textContent = "Loading…";

  const preset = STELLARATOR_PRESETS[key];
  try {
    const data = await loadSurfaces(preset.file);
    viewer.setSurfaces(data);

    const outer = data.surfaces[data.surfaces.length - 1];
    lastVolume_m3 = computeSurfaceVolume(outer, data.nTheta, data.nZeta);
    rebuildBurnModel();

    statusEl.textContent =
      `${preset.label} — NFP ${data.NFP}, ${data.nSurfaces} nested surfaces ` +
      `(precomputed DESC equilibrium), V = ${lastVolume_m3.toFixed(1)} m³. ${preset.note}`;
  } catch (err) {
    statusEl.textContent = `Failed to load ${preset.label}: ${err.message}`;
  }
}

const configButtons = buildPresetButtons(
  document.getElementById("config-presets"),
  STELLARATOR_PRESETS,
  selectConfig,
  state.configKey,
  CONFIG_HOTKEYS
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

wireHowItWorks(document.getElementById("how-toggle"), document.getElementById("how-panel"));
wireKeyboardShortcuts({
  ...Object.fromEntries(CONFIG_HOTKEYS.map((k, i) => [k, () => configButtons[configKeys[i]].click()])),
  ...Object.fromEntries(FUEL_HOTKEYS.map((k, i) => [k, () => fuelButtons[fuelKeys[i]].click()])),
  ...Object.fromEntries(CAPTURE_HOTKEYS.map((k, i) => [k, () => captureButtons[captureKeys[i]].click()])),
  ...Object.fromEntries(TIMEFRAME_HOTKEYS.map((k, i) => [k, () => timeframeButtons[timeframeKeys[i]].click()])),
});

// ---- Live burn simulation ------------------------------------------------------------
// Same 0D closed-form model as the tokamak page (src/fusion/burn.js), driven by this
// configuration's actual solved-equilibrium volume (see stellarator.html's "How this works").

const statTimeEl = document.getElementById("stat-time");
const statPowerEl = document.getElementById("stat-power");
const statEnergyEl = document.getElementById("stat-energy");
const statRateEl = document.getElementById("stat-rate");
const statElectricPowerEl = document.getElementById("stat-electric-power");
const statElectricEnergyEl = document.getElementById("stat-electric-energy");
const statNetEnergyEl = document.getElementById("stat-net-energy");
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
const REDRAW_INTERVAL_MS = 66;

// Whether the confining field has been energized this "shot" -- see src/app/main.js's
// matching comment for the framing (same semantics on both pages).
let magnetActivated = false;
let activationEnergySpent_J = 0;

const burnModeButtons = buildPresetButtons(
  document.getElementById("burn-mode-presets"),
  BURN_MODES,
  (key) => {
    burnMode = key;
    setActive(burnModeButtons, key);
    resetShot();
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
burnToggleBtn.addEventListener("click", () => setBurnPlaying(!burnPlaying));
burnResetBtn.addEventListener("click", () => resetShot());

function setBurnPlaying(playing) {
  burnPlaying = playing;
  burnToggleBtn.textContent = burnPlaying ? "⏸ Pause" : "▶ Play";
  if (burnPlaying) {
    if (!magnetActivated) {
      magnetActivated = true;
      activationEnergySpent_J = ITER_MAGNET_ENERGY_J;
    }
    burnLastFrameReal = performance.now();
    rafHandle = requestAnimationFrame(burnTick);
  } else if (rafHandle) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  renderBurnState(performance.now());
}

// Ends the current "shot": de-energizes the field, refills fuel, zeros the clock and the
// activation cost -- the next Play starts fresh and pays the activation cost again.
function resetShot() {
  burnElapsedSim = 0;
  burnLastFrameReal = performance.now();
  magnetActivated = false;
  activationEnergySpent_J = 0;
  setBurnPlaying(false);
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

// Rebuilds the burn model from the currently selected fuel + this configuration's already-
// computed volume -- no reload needed, since changing fuel doesn't change the geometry.
function rebuildBurnModel() {
  if (lastVolume_m3 == null) return;
  const fuel = FUEL_PRESETS[state.fuelKey];
  burnModel = createBurnModel({
    fuel,
    T_keV: ILLUSTRATIVE_OPERATING_POINT.T_keV,
    n0_m3: ILLUSTRATIVE_OPERATING_POINT.n0_m3,
    volume_m3: lastVolume_m3,
  });
  gaugeEls = buildFuelGauges(document.getElementById("fuel-gauges"), fuel);
  resetShot();
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
  statNetEnergyEl.textContent = formatSignedEnergy(E_electric - activationEnergySpent_J);

  const powerLevel = burnModel.P0 > 0 ? P / burnModel.P0 : 0;
  const pulseHz = 0.3 + 1.2 * powerLevel;
  const glow = burnPlaying ? { powerLevel, pulsePhase: (now / 1000) * pulseHz * 2 * Math.PI } : null;
  viewer.setGlow(glow);
  viewer.setFuelFraction(frac);

  const horizonSeconds = TIMEFRAME_PRESETS[state.timeframeKey].seconds;
  const liveT = burnPlaying ? burnElapsedSim : null;
  const breakevenT = renderBurnChart(burnChartCanvas, burnModel, burnMode, horizonSeconds, capture, activationEnergySpent_J, liveT);
  if (!magnetActivated) {
    burnChartCaption.textContent = `Press Play to activate the field (${formatEnergy(ITER_MAGNET_ENERGY_J)}) and start the reaction.`;
  } else if (breakevenT != null) {
    burnChartCaption.textContent = `At this rate, electric output pays back the field's activation energy after ${formatTime(breakevenT)}.`;
  } else {
    burnChartCaption.textContent = `Electric output over ${TIMEFRAME_PRESETS[state.timeframeKey].label} doesn't pay back the field's activation energy at this rate.`;
  }
}

selectConfig(state.configKey);
