// Glue: preset selection -> worker solve -> canvas render -> live D-T burn simulation.
import { SHAPE_PRESETS, validateCustomBoundary } from "../geom/boundary.js";
import { PROFILE_PRESETS, buildPressureProfile } from "../profiles/presets.js";
import { FUEL_PRESETS } from "../fusion/fuels.js";
import { CAPTURE_PRESETS, convertToElectric } from "../fusion/capture.js";
import { createBurnModel, computeVolume } from "../fusion/burn.js";
import { FUSION_OPERATING_POINTS } from "../fusion/presets.js";
import { OPERATING_POINT_PRESETS } from "../fusion/operatingPoints.js";
import { ITER_MAGNET_ENERGY_J } from "../fusion/activation.js";
import { compileExpr } from "../math/exprParser.js";
import { renderEquilibrium } from "./render.js";
import { renderShotChart } from "./shotChart.js";
import { createTokamakViewer } from "./tokamak3d.js";
import { buildPresetButtons, setActive, wireHowItWorks, wireDropdown, wireKeyboardShortcuts, buildFuelGauges } from "./ui.js";
import { wireThemeToggle } from "./theme.js";
import {
  formatTime,
  formatPower,
  formatEnergy,
  formatSignedEnergy,
  formatRate,
  formatDensity,
  formatTesla,
  formatMA,
  formatKeV,
  formatDimensionless,
  formatMW,
  formatMWm2,
  formatCelsius,
  formatMM,
} from "./format.js";
import { paintLegendBar } from "./legend.js";
import { computeInternalInductance, computeBoundarySurfaceArea } from "../fem/fluxDiagnostics.js";
import {
  AVG_ION_MASS_AMU,
  computeThermalEnergyJ,
  computePressurePa,
  computeBetaN,
  computeBpEdgeT,
  computeQ95Approx,
  computeIPB98TauE,
  computeLHThreshold,
  computePowerBalance,
  estimateLambdaQmm,
  estimateDivertorHeatFluxMWm2,
  estimateDetachmentFraction,
  estimateSurfaceTempC,
  estimateRadiatedPowerMW,
  estimateDAlphaBase,
} from "../fusion/diagnostics.js";

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
const operatingPointKeys = Object.keys(OPERATING_POINT_PRESETS);
const SHAPE_HOTKEYS = ["1", "2", "3"];
const CUSTOM_SHAPE_HOTKEY = "4";
const PROFILE_HOTKEYS = ["q", "w", "e", "r"];
const FUEL_HOTKEYS = ["z", "x", "c"];
const CAPTURE_HOTKEYS = ["a", "f"];
const OPERATING_POINT_HOTKEYS = ["o", "p"];
const DEFAULT_CUSTOM_EXPR = "1 + 0.3*cos(3*theta)";

// Shareable state via URL fragment, e.g. #shape=iterLike&profile=highBeta&fuel=dt&capture=blanketSteam
// -- mirrors eigendrum's #p=circle. A custom shape adds &r=<encoded r(theta) expression>.
function parseHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const shapeParam = params.get("shape");
  const profileKey = params.get("profile");
  const fuelKey = params.get("fuel");
  const captureKey = params.get("capture");
  const operatingPointKey = params.get("op");
  const isCustomShape = shapeParam === "custom";
  return {
    shapeKey: isCustomShape ? "custom" : shapeKeys.includes(shapeParam) ? shapeParam : shapeKeys[0],
    customExpr: (isCustomShape && params.get("r")) || DEFAULT_CUSTOM_EXPR,
    profileKey: profileKeys.includes(profileKey) ? profileKey : profileKeys[0],
    fuelKey: fuelKeys.includes(fuelKey) ? fuelKey : fuelKeys[0],
    captureKey: captureKeys.includes(captureKey) ? captureKey : captureKeys[0],
    operatingPointKey: operatingPointKeys.includes(operatingPointKey) ? operatingPointKey : operatingPointKeys[0],
  };
}

function updateHash() {
  const parts = [
    `shape=${state.shapeKey}`,
    `profile=${state.profileKey}`,
    `fuel=${state.fuelKey}`,
    `capture=${state.captureKey}`,
    `op=${state.operatingPointKey}`,
  ];
  if (state.shapeKey === "custom") parts.push(`r=${encodeURIComponent(state.customExpr)}`);
  history.replaceState(null, "", `#${parts.join("&")}`);
  storyLink.href = `story.html#fuel=${state.fuelKey}&capture=${state.captureKey}`;
}

const state = parseHash();
let lastResult = null;
let lastVolume_m3 = null;
let lastOp = null;
let lastLi = null;
let lastSurfaceArea_m2 = null;

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

const operatingPointButtons = buildPresetButtons(
  document.getElementById("operating-point-presets"),
  OPERATING_POINT_PRESETS,
  (key) => {
    state.operatingPointKey = key;
    setActive(operatingPointButtons, key);
    updateHash();
    renderBurnState(performance.now());
  },
  state.operatingPointKey,
  OPERATING_POINT_HOTKEYS
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

const reactorHelpToggle = document.getElementById("reactor-help-toggle");
const reactorHelpPanel = document.getElementById("reactor-help-panel");
reactorHelpToggle.addEventListener("click", () => {
  reactorHelpPanel.hidden = !reactorHelpPanel.hidden;
  reactorHelpToggle.setAttribute("aria-expanded", String(!reactorHelpPanel.hidden));
});

customShapeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    applyCustomShape();
  }
});
customShapeInput.addEventListener("blur", applyCustomShape);

wireHowItWorks(document.getElementById("how-toggle"), document.getElementById("how-panel"));
wireDropdown(document.getElementById("variables-toggle"), document.getElementById("variables-panel"));
wireDropdown(document.getElementById("faq-toggle"), document.getElementById("faq-panel"));

const themeToggleInput = document.getElementById("theme-toggle-input");
const themeToggleText = document.getElementById("theme-toggle-text");
wireThemeToggle(themeToggleInput);
themeToggleText.textContent = themeToggleInput.checked ? "Dark mode" : "Light mode";
themeToggleInput.addEventListener("change", () => {
  themeToggleText.textContent = themeToggleInput.checked ? "Dark mode" : "Light mode";
  redraw();
  renderBurnState(performance.now());
});

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
  ...Object.fromEntries(
    OPERATING_POINT_HOTKEYS.map((k, i) => [k, () => operatingPointButtons[operatingPointKeys[i]].click()])
  ),
});

meshToggle.addEventListener("change", () => {
  state.showMesh = meshToggle.checked;
  redraw();
});

// Returns whether the canvas's pixel size actually changed, so callers can skip work when it
// didn't -- mobile browsers fire "resize" when the address bar/chrome collapses on scroll,
// even though the container's width (what this canvas is sized from) hasn't moved at all.
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.max(320, Math.min(rect.width, 720));
  if (canvas.width === size && canvas.height === size) return false;
  canvas.width = size;
  canvas.height = size;
  return true;
}
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Re-solving the equilibrium here was never actually necessary -- the Grad-Shafranov
    // solve doesn't depend on the canvas's pixel size at all, only on shape/profile. Calling
    // solve() on every resize needlessly round-tripped the worker AND (via
    // rebuildBurnModel -> resetShot) reset the running shot -- on mobile, a page *scroll* can
    // itself trigger a resize event (the browser chrome collapsing), so this used to stop
    // playback just from scrolling down to look at the dashboard. A plain redraw() from the
    // already-solved mesh is all a resize ever needed.
    if (resizeCanvas()) redraw();
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
const statNetEnergyEl = document.getElementById("stat-net-energy");
const burnToggleBtn = document.getElementById("burn-toggle");
const burnResetBtn = document.getElementById("burn-reset");
const burnSpeedSelect = document.getElementById("burn-speed");

// ---- New diagnostics dashboard DOM refs --------------------------------------------
const sliceBtEl = document.getElementById("slice-bt");
const sliceModeBadgeEl = document.getElementById("slice-mode-badge");
const sliceModeEl = document.getElementById("slice-mode");
const sliceBetaNEl = document.getElementById("slice-betan");
const sliceQ95El = document.getElementById("slice-q95");
const diagIpEl = document.getElementById("diag-ip");
const diagWthEl = document.getElementById("diag-wth");
const diagH98El = document.getElementById("diag-h98");
const diagTe0El = document.getElementById("diag-te0");
const diagNeEl = document.getElementById("diag-ne");
const diagTauEEl = document.getElementById("diag-taue");
const diagLiEl = document.getElementById("diag-li");
const pwOhEl = document.getElementById("pw-oh");
const pwNbiEl = document.getElementById("pw-nbi");
const pwEchEl = document.getElementById("pw-ech");
const pwIchEl = document.getElementById("pw-ich");
const pwAlphaEl = document.getElementById("pw-alpha");
const pwRadEl = document.getElementById("pw-rad");
const pwLossEl = document.getElementById("pw-loss");
const pwDwdtEl = document.getElementById("pw-dwdt");
const pwPinEl = document.getElementById("pw-pin");
const pwPoutEl = document.getElementById("pw-pout");
const divLambdaQEl = document.getElementById("div-lambdaq");
const divFdetEl = document.getElementById("div-fdet");
const divQiEl = document.getElementById("div-qi");
const divTsEl = document.getElementById("div-ts");
const shotChartCanvas = document.getElementById("shot-chart");
const lhThresholdCaptionEl = document.getElementById("lh-threshold-caption");
const faqHomesPoweredEl = document.getElementById("faq-homes-powered");

// U.S. EIA average annual residential electricity consumption -- see the FAQ dropdown.
const AVG_US_HOME_KWH_PER_YEAR = 10500;
const HOURS_PER_YEAR = 8760;

const SHOT_HISTORY_WINDOW_S = 20;
let shotHistory = [];
let lastWthClean_J = 0;
let lastWthFrameReal = null;

// Magnet/current/heating ramp -- decoupled from the fuel-burn clock (burnElapsedSim) above.
// Drives the new real-unit diagnostics (Bt/Ip/beta_N/q_95/tau_E/H98/power balance) and the 3D
// coil glow continuously through ramp-up -> flat-top -> ramp-down, instead of the old
// instant on/off. See index.html's "The shot" how-it-works section.
const RAMP_UP_MS = 1400;
const RAMP_DOWN_MS = 1100;
let rampState = "off"; // "off" | "up" | "flat" | "down"
let rampStartReal = 0;
let rampFrac = 0;
let rampDownRaf = null;

function smoothstep01(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function updateRampFrac(now) {
  if (rampState === "up") {
    const t = (now - rampStartReal) / RAMP_UP_MS;
    if (t >= 1) {
      rampFrac = 1;
      rampState = "flat";
    } else {
      rampFrac = smoothstep01(t);
    }
  } else if (rampState === "down") {
    const t = (now - rampStartReal) / RAMP_DOWN_MS;
    if (t >= 1) {
      rampFrac = 0;
      rampState = "off";
    } else {
      rampFrac = 1 - smoothstep01(t);
    }
  }
}

function startRampDownLoop() {
  if (rampDownRaf) return;
  function tick(now) {
    if (rampState === "down") {
      renderBurnState(now);
      rampDownRaf = requestAnimationFrame(tick);
    } else {
      rampDownRaf = null;
    }
  }
  rampDownRaf = requestAnimationFrame(tick);
}

// Current shape's (R0, a, kappa) -- from the Miller preset, or estimated from the solved
// mesh's own bounding box for the equation-based custom shape (which has no fixed a/kappa).
function shapeGeometry() {
  if (!lastResult) return { R0_m: 3, a_m: 1, kappa: 1 };
  if (lastResult.shapeKey !== "custom") {
    const s = SHAPE_PRESETS[lastResult.shapeKey];
    return { R0_m: s.R0, a_m: s.a, kappa: s.kappa };
  }
  let minR = Infinity,
    maxR = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [R, Z] of lastResult.nodes) {
    if (R < minR) minR = R;
    if (R > maxR) maxR = R;
    if (Z < minZ) minZ = Z;
    if (Z > maxZ) maxZ = Z;
  }
  const a_m = (maxR - minR) / 2;
  const R0_m = (maxR + minR) / 2;
  const kappa = a_m > 0 ? (maxZ - minZ) / (2 * a_m) : 1;
  return { R0_m, a_m, kappa };
}

// Deterministic small-amplitude texture (two off-frequency sines), the same idiom as
// render.js's glow pulse -- an illustrative "real shot trace isn't perfectly flat" cue, not a
// turbulence simulation.
function shotTexture(t) {
  return 1 + 0.015 * Math.sin(2 * Math.PI * 0.7 * t) + 0.01 * Math.sin(2 * Math.PI * 2.3 * t + 1.0);
}

// Illustrative ELM-like D-alpha spike train layered on top of a steady base level.
function dAlphaSignal(base, t) {
  const spike = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 0.15 * t)), 8);
  return base * (1 + 0.15 * Math.sin(2 * Math.PI * 0.5 * t) + 1.2 * spike);
}

function renderDiagnostics(now, elapsedSim, P_fusion_W, chargedFrac) {
  const op = OPERATING_POINT_PRESETS[state.operatingPointKey];
  const opPoint = FUSION_OPERATING_POINTS[state.profileKey];
  const { R0_m, a_m, kappa } = shapeGeometry();
  const epsilon = R0_m > 0 ? a_m / R0_m : 0;
  const M_amu = AVG_ION_MASS_AMU[state.fuelKey] || 2.5;

  const Bt_T = op.Bt_T * rampFrac;
  const Ip_MA = op.Ip_MA * rampFrac;
  const P_OH = op.P_OH_MW * rampFrac;
  const P_NBI = op.P_NBI_MW * rampFrac;
  const P_ECH = op.P_ECH_MW * rampFrac;
  const P_ICH = op.P_ICH_MW * rampFrac;
  const P_alpha = (chargedFrac * P_fusion_W * rampFrac) / 1e6; // MW

  // n_e_eff carries the cosmetic shot-trace jitter (for display/beta_N/W_th tile texture,
  // per the "rises slightly, alternates around a fixed value" request); n_e_clean is the same
  // but without jitter, used only for dW/dt below so that finite-differencing doesn't amplify
  // the display texture into spurious noise on a quantity meant to be ~0 at flat-top.
  const n_e_eff = opPoint.n0_m3 * rampFrac * shotTexture(elapsedSim);
  const n_e_clean = opPoint.n0_m3 * rampFrac;
  const Wth_J = computeThermalEnergyJ(n_e_eff, opPoint.T_keV, lastVolume_m3 || 0);
  const Wth_clean_J = computeThermalEnergyJ(n_e_clean, opPoint.T_keV, lastVolume_m3 || 0);
  const pBar_Pa = computePressurePa(Wth_J, lastVolume_m3 || 0);
  const betaN = computeBetaN(pBar_Pa, Bt_T, a_m, Ip_MA);
  const q95 = computeQ95Approx(a_m, R0_m, kappa, Bt_T, Ip_MA);

  // dW/dt via finite difference of the clean (unjittered) thermal energy -- real transient
  // during ramp-up/down, ~0 at flat-top (rampFrac constant -> Wth_clean_J constant).
  let dWdt_MW = 0;
  if (lastWthFrameReal != null) {
    const dt_s = (now - lastWthFrameReal) / 1000;
    if (dt_s > 0) dWdt_MW = (Wth_clean_J - lastWthClean_J) / dt_s / 1e6;
  }
  lastWthClean_J = Wth_clean_J;
  lastWthFrameReal = now;

  const P_rad = estimateRadiatedPowerMW(n_e_eff / 1e20, opPoint.T_keV);
  const balance = computePowerBalance({ P_OH, P_NBI, P_ECH, P_ICH, P_alpha, P_rad, dWdt_MW });

  const tauE_actual = balance.P_loss > 0 ? Wth_J / (balance.P_loss * 1e6) : 0;
  const tauE_IPB98 = computeIPB98TauE({
    Ip_MA,
    Bt_T,
    nebar_1e19: n_e_eff / 1e19,
    P_loss_MW: balance.P_loss,
    R0_m,
    kappa,
    epsilon,
    M_amu,
  });
  const H98 = tauE_IPB98 > 0 ? tauE_actual / tauE_IPB98 : 0;

  const S_m2 = lastSurfaceArea_m2 || 0;
  const P_LH = computeLHThreshold({ nebar_1e20: n_e_eff / 1e20, Bt_T, S_m2, A_eff: M_amu });
  const P_aux = P_NBI + P_ECH + P_ICH;
  const isHMode = rampFrac > 0.05 && P_aux > P_LH;
  if (lhThresholdCaptionEl) {
    lhThresholdCaptionEl.textContent =
      rampFrac > 0.05
        ? `H-mode needs aux. heating (P_NBI+P_ECH+P_ICH) above the Martin08 threshold P_LH ≈ ${P_LH.toFixed(1)} MW — currently providing ${P_aux.toFixed(1)} MW.`
        : `H-mode threshold (Martin08): P_LH ≈ ${P_LH.toFixed(1)} MW at the current operating point.`;
  }

  // Guarded at a small Ip floor: estimateLambdaQmm's inverse power law blows up as Bp -> 0,
  // which is only reached with no plasma current -- not a meaningful "wide SOL" regime, just
  // an off state, so it's displayed as 0 instead of a runaway extrapolation.
  const Bp_edge_T = computeBpEdgeT(a_m, Ip_MA);
  const lambdaQ_mm = Ip_MA > 0.05 ? estimateLambdaQmm(Bp_edge_T) : 0;
  const qi_MWm2 = estimateDivertorHeatFluxMWm2(balance.P_loss, R0_m, lambdaQ_mm);
  const fdet = estimateDetachmentFraction(P_rad, balance.P_loss);
  const tPulse_s = shotStartReal != null ? (now - shotStartReal) / 1000 : 0;
  const ts_C = estimateSurfaceTempC(qi_MWm2, tPulse_s);
  const dAlpha = dAlphaSignal(estimateDAlphaBase(balance.P_loss), elapsedSim);

  sliceBtEl.textContent = formatTesla(Bt_T);
  sliceModeEl.textContent = rampFrac > 0.05 ? (isHMode ? "H-mode" : "L-mode") : "—";
  sliceModeBadgeEl.classList.toggle("mode-h", rampFrac > 0.05 && isHMode);
  sliceModeBadgeEl.classList.toggle("mode-l", rampFrac > 0.05 && !isHMode);
  sliceBetaNEl.textContent = formatDimensionless(betaN);
  sliceQ95El.textContent = formatDimensionless(q95);

  diagIpEl.textContent = formatMA(Ip_MA);
  diagWthEl.textContent = formatEnergy(Wth_J);
  diagH98El.textContent = formatDimensionless(H98);
  diagTe0El.textContent = formatKeV(opPoint.T_keV);
  diagNeEl.textContent = formatDensity(n_e_eff);
  diagTauEEl.textContent = tauE_actual.toFixed(2) + " s";
  diagLiEl.textContent = lastLi != null ? formatDimensionless(lastLi) : "—";

  pwOhEl.textContent = formatMW(P_OH);
  pwNbiEl.textContent = formatMW(P_NBI);
  pwEchEl.textContent = formatMW(P_ECH);
  pwIchEl.textContent = formatMW(P_ICH);
  pwAlphaEl.textContent = formatMW(P_alpha);
  pwRadEl.textContent = formatMW(P_rad);
  pwLossEl.textContent = formatMW(balance.P_loss);
  pwDwdtEl.textContent = formatMW(dWdt_MW);
  pwPinEl.textContent = formatMW(balance.P_in);
  pwPoutEl.textContent = formatMW(balance.P_out);

  divLambdaQEl.textContent = formatMM(lambdaQ_mm);
  divFdetEl.textContent = formatDimensionless(fdet);
  divQiEl.textContent = formatMWm2(qi_MWm2);
  divTsEl.textContent = formatCelsius(ts_C);

  if (rampFrac > 0) {
    shotHistory.push({ t: elapsedSim, Ip_MA, betaN, dAlpha, Wth_MJ: Wth_J / 1e6 });
    const cutoff = elapsedSim - SHOT_HISTORY_WINDOW_S;
    while (shotHistory.length > 2 && shotHistory[0].t < cutoff) shotHistory.shift();
  } else if (rampState === "off") {
    shotHistory = [];
  }

  // Flat-top setpoints (rampFrac=1), recomputed from the same formulas above so the chart's
  // dashed reference lines always match the currently selected operating point/profile/fuel.
  const Wth_setpoint_J = computeThermalEnergyJ(opPoint.n0_m3, opPoint.T_keV, lastVolume_m3 || 0);
  const pBar_setpoint = computePressurePa(Wth_setpoint_J, lastVolume_m3 || 0);
  const betaN_setpoint = computeBetaN(pBar_setpoint, op.Bt_T, a_m, op.Ip_MA);
  const balance_setpoint = computePowerBalance({
    P_OH: op.P_OH_MW,
    P_NBI: op.P_NBI_MW,
    P_ECH: op.P_ECH_MW,
    P_ICH: op.P_ICH_MW,
    P_alpha: (chargedFrac * P_fusion_W) / 1e6,
    P_rad: estimateRadiatedPowerMW(opPoint.n0_m3 / 1e20, opPoint.T_keV),
    dWdt_MW: 0,
  });
  renderShotChart(
    shotChartCanvas,
    shotHistory,
    {
      Ip_MA: op.Ip_MA,
      betaN: betaN_setpoint,
      dAlpha: estimateDAlphaBase(balance_setpoint.P_loss),
      Wth_MJ: Wth_setpoint_J / 1e6,
    },
    SHOT_HISTORY_WINDOW_S
  );

  viewer3d.setMagnetActive(rampFrac);
}

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

// Whether the confining magnetic field has been energized this "shot" (Reset -> next Reset).
// Play activates it and charges the one-time activation cost exactly once per shot -- pausing
// and resuming doesn't re-charge it, only a fresh Reset does. See the Reactor caption and
// "Live fuel burn" how-it-works section for the framing.
let magnetActivated = false;
let activationEnergySpent_J = 0;
// Real (not sped-up) elapsed time since this shot's magnets were first energized -- drives
// the divertor surface-temperature estimate's transient conduction time, a genuine hardware
// timescale independent of the fuel-burn clock's speed multiplier.
let shotStartReal = null;

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

burnToggleBtn.addEventListener("click", () => {
  setBurnPlaying(!burnPlaying);
});

burnResetBtn.addEventListener("click", () => {
  resetShot();
});

function setBurnPlaying(playing) {
  burnPlaying = playing;
  burnToggleBtn.textContent = burnPlaying ? "⏸ Pause" : "▶ Play";
  burnToggleBtn.classList.toggle("playing", burnPlaying);
  const now = performance.now();
  if (burnPlaying) {
    if (!magnetActivated) {
      magnetActivated = true;
      activationEnergySpent_J = ITER_MAGNET_ENERGY_J;
      shotStartReal = now;
    }
    if (rampDownRaf) {
      cancelAnimationFrame(rampDownRaf);
      rampDownRaf = null;
    }
    rampState = "up";
    rampStartReal = now;
    burnLastFrameReal = now;
    rafHandle = requestAnimationFrame(burnTick);
  } else {
    if (rafHandle) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    if (rampFrac > 0) {
      rampState = "down";
      rampStartReal = now;
      startRampDownLoop();
    } else {
      rampState = "off";
    }
  }
  renderBurnState(now);
}

// Ends the current "shot": de-energizes the magnet, refills fuel, zeros the clock and the
// activation cost -- the next Play starts fresh and pays the activation cost again.
function resetShot() {
  burnElapsedSim = 0;
  burnLastFrameReal = performance.now();
  magnetActivated = false;
  activationEnergySpent_J = 0;
  shotStartReal = null;
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

// Rebuilds the burn model (and its fuel gauges) from the currently selected fuel, reusing the
// already-solved equilibrium's volume/operating point -- no fresh worker solve needed, since
// changing fuel doesn't change the plasma shape or steady-state profile.
function rebuildBurnModel() {
  if (lastVolume_m3 == null || lastOp == null) return;
  const fuel = FUEL_PRESETS[state.fuelKey];
  burnModel = createBurnModel({ fuel, T_keV: lastOp.T_keV, n0_m3: lastOp.n0_m3, volume_m3: lastVolume_m3 });
  gaugeEls = buildFuelGauges(document.getElementById("fuel-gauges"), fuel);
  resetShot();
}

function renderBurnState(now) {
  if (!burnModel) return;
  updateRampFrac(now);
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

  // Sustaining the current electric power reading for a full year, divided by the EIA's
  // ~10,500 kWh/year average U.S. household figure (see the FAQ) -- a live unit-conversion
  // demonstration of the electric-power stat tile just above, not a separate estimate.
  if (faqHomesPoweredEl) {
    const homesPowered = (P_electric * HOURS_PER_YEAR) / (AVG_US_HOME_KWH_PER_YEAR * 1000);
    faqHomesPoweredEl.textContent = Math.round(homesPowered).toLocaleString();
  }

  const powerLevel = burnModel.P0 > 0 ? P / burnModel.P0 : 0;
  const pulseHz = 0.3 + 1.2 * powerLevel;
  state.glow = burnPlaying ? { powerLevel, pulsePhase: (now / 1000) * pulseHz * 2 * Math.PI } : null;
  state.fuelFrac = frac;
  redraw();
  viewer3d.setGlow(state.glow);
  viewer3d.setFuelFraction(frac);

  renderDiagnostics(now, burnElapsedSim, P, burnModel.chargedFrac);
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
  lastSurfaceArea_m2 = computeBoundarySurfaceArea(mesh);
  lastLi = computeInternalInductance(mesh, data.psi);
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
    fuelFrac: state.fuelFrac == null ? 1 : state.fuelFrac,
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
