// Preset button lists and the "how it works" panel toggle.

export function buildPresetButtons(container, presets, onSelect, defaultKey) {
  container.innerHTML = "";
  const buttons = {};
  for (const key of Object.keys(presets)) {
    const btn = document.createElement("button");
    btn.textContent = presets[key].label;
    btn.className = "preset-btn";
    btn.type = "button";
    btn.dataset.key = key;
    btn.addEventListener("click", () => onSelect(key));
    container.appendChild(btn);
    buttons[key] = btn;
  }
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
