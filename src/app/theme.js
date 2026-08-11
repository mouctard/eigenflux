// Dark-by-default theme toggle, shared across both pages (stylesheet is shared too). The
// class is applied as early as possible via an inline script in each page's <head> (before
// first paint) to avoid a flash of the wrong theme; this module just wires the visible
// toggle control and keeps localStorage in sync with it.
const STORAGE_KEY = "eigenflux-theme";

export function getTheme() {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function setTheme(theme) {
  document.documentElement.classList.toggle("light", theme === "light");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing / storage disabled -- theme just won't persist, not fatal.
  }
}

// Wires a checkbox input (checked = light mode) to the theme, reflecting whatever the
// anti-FOUC inline script already applied to <html> on load.
export function wireThemeToggle(inputEl) {
  inputEl.checked = getTheme() === "light";
  inputEl.addEventListener("change", () => {
    setTheme(inputEl.checked ? "light" : "dark");
    onThemeChangeCallbacks.forEach((cb) => cb(getTheme()));
  });
}

const onThemeChangeCallbacks = [];
export function onThemeChange(cb) {
  onThemeChangeCallbacks.push(cb);
}

// Canvas fill/stroke colors aren't CSS -- callers (render.js, burnChart.js, shotChart.js,
// tokamak3d.js) read these instead of hardcoding a light-mode-only palette. Kept in sync with
// the CSS custom properties in styles/style.css by hand (small, fixed palette, not worth a
// getComputedStyle round-trip on every animation frame).
const PALETTES = {
  dark: {
    canvasBg: "#14161c",
    gridLine: "rgba(255,255,255,0.35)",
    boundaryLine: "#e8e8ea",
    axisMarker: "#f5f5f5",
    axisText: "#9a9ea8",
    gridStroke: "rgba(255,255,255,0.12)",
    chartAxis: "#3a3f4a",
    chartLabel: "#9a9ea8",
    sceneBg: 0x14161c,
  },
  light: {
    canvasBg: "#fafaf8",
    gridLine: "rgba(255,255,255,0.55)",
    boundaryLine: "#1a1a1a",
    axisMarker: "#111111",
    axisText: "#6a6a6a",
    gridStroke: "rgba(20,20,20,0.35)",
    chartAxis: "#d8d8d3",
    chartLabel: "#6a6a6a",
    sceneBg: 0xfafaf8,
  },
};

export function getCanvasPalette() {
  return PALETTES[getTheme()];
}
