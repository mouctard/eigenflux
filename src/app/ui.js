// Preset button lists, the "how it works" panel toggle, and keyboard shortcuts.

export function buildPresetButtons(container, presets, onSelect, defaultKey, keyLabels) {
  container.innerHTML = "";
  const buttons = {};
  Object.keys(presets).forEach((key, i) => {
    const btn = document.createElement("button");
    btn.className = "preset-btn";
    btn.type = "button";
    btn.dataset.key = key;

    const label = document.createElement("span");
    label.textContent = presets[key].label;
    btn.appendChild(label);

    if (keyLabels && keyLabels[i]) {
      const kbd = document.createElement("span");
      kbd.className = "kbd-hint";
      kbd.textContent = keyLabels[i].toUpperCase();
      btn.appendChild(kbd);
    }

    btn.addEventListener("click", () => onSelect(key));
    container.appendChild(btn);
    buttons[key] = btn;
  });
  setActive(buttons, defaultKey);
  return buttons;
}

export function setActive(buttons, key) {
  for (const [k, btn] of Object.entries(buttons)) {
    btn.classList.toggle("active", k === key);
  }
}

// Builds 1 (self-reaction fuels like D-D) or 2 (cross-species fuels like D-T, D-3He) gauge
// rows from a fuel preset's `species` list (src/fusion/fuels.js), replacing whatever was
// there before. Returns one {fillEl, pctEl, densityEl} per species, in order -- since this
// project's burn model treats all of a fuel's reactant species as equal-density (see
// src/fusion/burn.js), callers write the same n/pct/density to every entry.
export function buildFuelGauges(container, fuel) {
  container.innerHTML = "";
  return fuel.species.map((sp) => {
    const gauge = document.createElement("div");
    gauge.className = "gauge";

    const label = document.createElement("div");
    label.className = "gauge-label";
    const dot = document.createElement("span");
    dot.className = `gauge-dot gauge-dot-${sp.colorClass}`;
    label.appendChild(dot);
    label.appendChild(document.createTextNode(sp.label + " "));
    const pctEl = document.createElement("span");
    pctEl.textContent = "100%";
    label.appendChild(pctEl);
    gauge.appendChild(label);

    const track = document.createElement("div");
    track.className = "gauge-track";
    const fillEl = document.createElement("div");
    fillEl.className = `gauge-fill gauge-fill-${sp.colorClass}`;
    track.appendChild(fillEl);
    gauge.appendChild(track);

    const densityEl = document.createElement("div");
    densityEl.className = "gauge-sub";
    densityEl.textContent = "—";
    gauge.appendChild(densityEl);

    container.appendChild(gauge);
    return { fillEl, pctEl, densityEl };
  });
}

// All of this page's disclosure widgets (the sidebar's "How X works" toggles, the Variables/
// FAQ dropdowns, and the main "How this works" panel) are native <details>/<summary> elements
// in the HTML -- click-to-toggle is therefore handled entirely by the browser, guaranteed to
// work with mouse, touch, and keyboard on every device with zero custom JS involved (a prior
// version of these used a hand-rolled click handler toggling a CSS class, which turned out to
// be exactly the kind of thing that can silently misbehave on some mobile browsers).
//
// wireDropdown adds one small, non-essential enhancement on top of that native behavior:
// closing a floating dropdown (Variables/FAQ) when the user clicks elsewhere or presses
// Escape. If this listener never fires for some reason, the dropdown still opens and closes
// perfectly fine via its own <summary> -- this only ever adds convenience, never removes it.
// Guarded against a missing element on purpose: this used to dereference detailsEl directly,
// so a single mismatched id (e.g. a stale cached copy of one of index.html/main.js loaded
// alongside a fresh copy of the other) threw synchronously here and silently aborted the rest
// of main.js's top-level script -- including wiring the Play button, much further down the
// file. No init-time helper in this module should ever be able to do that again.
export function wireDropdown(detailsEl) {
  if (!detailsEl) return;
  document.addEventListener("click", (e) => {
    if (detailsEl.open && !detailsEl.contains(e.target)) detailsEl.open = false;
  });
  detailsEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") detailsEl.open = false;
  });
}

// keyMap: { "1": () => ..., "q": () => ... }. Modifier combos (cmd/ctrl/alt) pass through
// untouched so browser shortcuts keep working, and so does any typing into a text field (the
// custom-shape equation input) or other editable element -- otherwise typing e.g. "cos" into
// it would also fire the "c" fuel hotkey.
export function wireKeyboardShortcuts(keyMap) {
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    const handler = keyMap[e.key.toLowerCase()];
    if (handler) {
      handler();
      e.preventDefault();
    }
  });
}
