// Glue: config preset selection -> load precomputed surfaces -> 3D render.
import { STELLARATOR_PRESETS } from "./presets.js";
import { loadSurfaces } from "./loadSurfaces.js";
import { createViewer } from "./viewer.js";
import { buildPresetButtons, setActive, wireHowItWorks, wireKeyboardShortcuts } from "../app/ui.js";
import { paintLegendBar } from "../app/legend.js";

const container = document.getElementById("viewer");
const statusEl = document.getElementById("status");
const viewer = createViewer(container);

paintLegendBar(document.getElementById("depth-legend"));

const keys = Object.keys(STELLARATOR_PRESETS);
const HOTKEYS = ["1", "2", "3"];

function parseHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const key = params.get("config");
  return keys.includes(key) ? key : keys[0];
}

let currentKey = parseHash();

function updateHash() {
  history.replaceState(null, "", `#config=${currentKey}`);
}

async function select(key) {
  currentKey = key;
  setActive(buttons, key);
  updateHash();
  statusEl.textContent = "Loading…";

  const preset = STELLARATOR_PRESETS[key];
  try {
    const data = await loadSurfaces(preset.file);
    viewer.setSurfaces(data);
    statusEl.textContent =
      `${preset.label} — NFP ${data.NFP}, ${data.nSurfaces} nested surfaces ` +
      `(precomputed DESC equilibrium). ${preset.note}`;
  } catch (err) {
    statusEl.textContent = `Failed to load ${preset.label}: ${err.message}`;
  }
}

const buttons = buildPresetButtons(
  document.getElementById("config-presets"),
  STELLARATOR_PRESETS,
  select,
  currentKey,
  HOTKEYS
);

wireHowItWorks(document.getElementById("how-toggle"), document.getElementById("how-panel"));
wireKeyboardShortcuts(Object.fromEntries(HOTKEYS.map((k, i) => [k, () => buttons[keys[i]].click()])));

select(currentKey);
