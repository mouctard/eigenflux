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

export function wireHowItWorks(toggleEl, panelEl) {
  toggleEl.addEventListener("click", () => {
    const open = panelEl.classList.toggle("open");
    toggleEl.setAttribute("aria-expanded", String(open));
  });
}

// Small inline "how X works" toggle for sidebar preset groups: hidden by default, expands in
// place (same [hidden]-toggling idea as the custom-shape panel, generalized for reuse) so each
// section can carry a fuller explanation without the sidebar always paying for its height.
export function wireCollapsible(toggleEl, panelEl) {
  toggleEl.addEventListener("click", () => {
    panelEl.hidden = !panelEl.hidden;
    toggleEl.setAttribute("aria-expanded", String(!panelEl.hidden));
  });
}

// Small popover dropdown (Variables / FAQ glossaries): toggles open on click, closes on an
// outside click or Escape -- the extra behavior a floating menu needs that the inline
// how-it-works panel above doesn't (that one never needs to auto-close).
export function wireDropdown(toggleEl, panelEl) {
  function close() {
    panelEl.classList.remove("open");
    toggleEl.classList.remove("active");
    toggleEl.setAttribute("aria-expanded", "false");
  }
  toggleEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = panelEl.classList.toggle("open");
    toggleEl.classList.toggle("active", open);
    toggleEl.setAttribute("aria-expanded", String(open));
  });
  panelEl.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
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
