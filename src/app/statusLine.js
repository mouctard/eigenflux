// Builds a status-line DOM fragment with individual terms wrapped as glossary-tooltip
// triggers, for status text that's rebuilt wholesale (via replaceChildren) on every solve --
// unlike the rest of the page's prose, a plain .textContent assignment here would wipe out
// any tooltip spans wrapped into it on the previous solve, so this needs to be rebuilt as
// DOM nodes each time instead of auto-wrapped once at page load.
//
// `parts` is a mixed array: plain strings are inserted as-is, and { text, var } objects
// become `<span class="var-term" data-var="...">text</span>` -- call
// initGlossaryTooltips({ staticRoots: [statusEl] }) (src/app/tooltip.js) right after
// inserting the returned fragment to wire them up; safe to call every time since each solve
// creates fresh <span> elements, never re-wiring an already-wired one.
export function buildStatusFragment(parts) {
  const frag = document.createDocumentFragment();
  for (const part of parts) {
    if (typeof part === "string") {
      frag.appendChild(document.createTextNode(part));
    } else {
      const span = document.createElement("span");
      span.className = "var-term";
      span.tabIndex = 0;
      span.dataset.var = part.var;
      span.textContent = part.text;
      frag.appendChild(span);
    }
  }
  return frag;
}
