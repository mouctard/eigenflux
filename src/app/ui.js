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

export function wireHowItWorks(toggleEl, panelEl) {
  toggleEl.addEventListener("click", () => {
    const open = panelEl.classList.toggle("open");
    toggleEl.setAttribute("aria-expanded", String(open));
  });
}

// keyMap: { "1": () => ..., "q": () => ... }. Modifier combos (cmd/ctrl/alt) pass through
// untouched so browser shortcuts keep working.
export function wireKeyboardShortcuts(keyMap) {
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const handler = keyMap[e.key.toLowerCase()];
    if (handler) {
      handler();
      e.preventDefault();
    }
  });
}
