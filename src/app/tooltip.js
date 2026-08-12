// Hover/tap variable-glossary tooltips: replaces the old standalone "Variables ▾" dropdown
// with the definition appearing right next to the symbol itself, wherever it appears.
//
// Two ways a term becomes a tooltip trigger:
//  - Static: an element already carries `data-var="key"` in the HTML (the dashboard's
//    compact badges/tiles/power-rows/shot-trace overlay) -- wired up as-is.
//  - Auto-wrapped: prose containers (How this works, FAQ, the sidebar's collapsible
//    explainers) are scanned once at init and every occurrence of a cataloged symbol gets
//    wrapped in a new `<span class="var-term">` trigger, so the same tooltip appears at every
//    mention, not just a first one -- see wrapSubPatterns/wrapTextPattern below.
//
// Interaction: hover shows it (desktop); focus (Tab) shows it for keyboard users; a click/tap
// pins it open (stays open after the pointer leaves, for touchscreens with no hover) until
// tapped again, Escape, or a click elsewhere.
import { GLOSSARY, SUB_PATTERNS, TEXT_PATTERNS } from "./glossary.js";

let tooltipEl = null;
let pinnedEl = null;

function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "var-tooltip";
  tooltipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function positionTooltip(tip, el) {
  const rect = el.getBoundingClientRect();
  const margin = 8;
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left;
  const maxLeft = window.innerWidth - tipRect.width - margin;
  left = Math.max(margin, Math.min(left, maxLeft));
  let top = rect.bottom + 8;
  if (top + tipRect.height > window.innerHeight - margin) {
    top = rect.top - tipRect.height - 8;
  }
  top = Math.max(margin, top);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function showTooltip(el, key) {
  const entry = GLOSSARY[key];
  if (!entry) return;
  const tip = ensureTooltipEl();
  tip.innerHTML = `<div class="var-tooltip-term">${entry.term}</div><div class="var-tooltip-body">${entry.html}</div>`;
  tip.classList.add("visible");
  positionTooltip(tip, el);
}

function hideTooltip(el) {
  if (pinnedEl && pinnedEl !== el) return;
  if (pinnedEl === el) return; // pinned stays open until explicitly unpinned
  if (tooltipEl) tooltipEl.classList.remove("visible");
}

function unpin() {
  pinnedEl = null;
  if (tooltipEl) tooltipEl.classList.remove("visible");
}

function wireGlossaryTerm(el, key) {
  el.addEventListener("mouseenter", () => showTooltip(el, key));
  el.addEventListener("mouseleave", () => hideTooltip(el));
  el.addEventListener("focus", () => showTooltip(el, key));
  el.addEventListener("blur", () => hideTooltip(el));
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pinnedEl === el) {
      unpin();
    } else {
      pinnedEl = el;
      showTooltip(el, key);
    }
  });
}

let dismissWired = false;
function wireGlobalDismiss() {
  if (dismissWired) return;
  dismissWired = true;
  document.addEventListener("click", () => unpin());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") unpin();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (!pinnedEl && tooltipEl) tooltipEl.classList.remove("visible");
    },
    { passive: true, capture: true }
  );
}

// Marks up an already-existing element (a dashboard badge/tile/power-row/canvas-overlay div)
// as a glossary trigger, without touching its content.
export function markGlossaryTerm(el, key) {
  if (!el || !GLOSSARY[key]) return;
  el.classList.add("var-term");
  if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
  wireGlossaryTerm(el, key);
}

// Wires every element within `root` that already carries `data-var="key"` in the HTML.
function wireStaticTerms(root) {
  root.querySelectorAll("[data-var]").forEach((el) => markGlossaryTerm(el, el.dataset.var));
}

// A text node ending in `prefix`, immediately followed by a sibling <sub> element whose
// trimmed text equals `subText`, gets both nodes wrapped in one glossary-trigger span. Runs
// before wrapTextPattern's bare-beta pass so that pass never sees an already-consumed β.
function wrapSubPatterns(root) {
  const subs = Array.from(root.querySelectorAll("sub"));
  for (const subEl of subs) {
    if (subEl.closest(".var-term")) continue;
    const subText = subEl.textContent.trim();
    const prev = subEl.previousSibling;
    if (!prev || prev.nodeType !== Node.TEXT_NODE || !prev.data) continue;
    const prefixChar = prev.data.slice(-1);
    const pattern = SUB_PATTERNS.find((p) => p.prefix === prefixChar && p.subText === subText);
    if (!pattern) continue;

    const splitIndex = prev.data.length - 1;
    const prefixNode = splitIndex > 0 ? prev.splitText(splitIndex) : prev;

    const span = document.createElement("span");
    span.className = "var-term";
    span.tabIndex = 0;
    span.dataset.var = pattern.key;
    prefixNode.parentNode.insertBefore(span, prefixNode);
    span.appendChild(prefixNode);
    span.appendChild(subEl);
    wireGlossaryTerm(span, pattern.key);
  }
}

// Wraps every occurrence of a literal text string within root's text nodes (skipping ones
// already inside a trigger span, or inside <script>/<style>/<code>).
function wrapTextPattern(root, matchText, key) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.data.includes(matchText)) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && node.parentElement.closest(".var-term, script, style, code")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);

  for (const textNode of nodes) {
    let cursor = textNode;
    let idx;
    while ((idx = cursor.data.indexOf(matchText)) !== -1) {
      const match = cursor.splitText(idx);
      const after = match.splitText(matchText.length);
      const span = document.createElement("span");
      span.className = "var-term";
      span.tabIndex = 0;
      span.dataset.var = key;
      match.parentNode.insertBefore(span, match);
      span.appendChild(match);
      wireGlossaryTerm(span, key);
      cursor = after;
    }
  }
}

// Scans `root`'s prose for every cataloged symbol and wraps each occurrence as a trigger.
function autoWrapProse(root) {
  wrapSubPatterns(root);
  for (const { key, text } of TEXT_PATTERNS) wrapTextPattern(root, text, key);
}

// Entry point: wire up any already-marked static elements within `staticRoots`, and
// auto-wrap every cataloged symbol mentioned anywhere inside `proseRoots`.
export function initGlossaryTooltips({ staticRoots = [], proseRoots = [] } = {}) {
  wireGlobalDismiss();
  for (const root of staticRoots) {
    if (root) wireStaticTerms(root);
  }
  for (const root of proseRoots) {
    if (root) autoWrapProse(root);
  }
}
