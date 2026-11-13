// The build timings, as a dialog over Forge. It is a native dialog built by the shell, so the one rule in
// appearance.css gives it the app's look: centred, the golden ratio's measures, brand tokens. It writes no
// colour, type face or control style of its own; the few rules below only lay a table out, in the same tokens.
// The words go why, then how, then what, in plain words (FoundrySpecification.foundrySurfaceExperienceBoundary).
// Opened by the host (#telemetry, or Ctrl+Alt+T); it reads only through `telemetry`.
import { RULES } from "./prometheus.mjs";
import { LEVER_WORDS, SWITCH_WORDS } from "./words.mjs";

const STYLE = `
#foundry-build-timings .bt-table { overflow-x: auto; }
#foundry-build-timings table { width: 100%; min-width: 420px; border-collapse: collapse; }
#foundry-build-timings th, #foundry-build-timings td { padding: 5px 13px 5px 0; text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap; }
#foundry-build-timings th { font-weight: 500; color: var(--muted-foreground); }
#foundry-build-timings td.bt-over { color: var(--destructive); font-weight: 600; }
#foundry-build-timings .bt-card { border: 1px solid color-mix(in srgb, var(--popover-foreground) 10%, transparent); border-radius: 8px; padding: 8px 13px; display: flex; flex-direction: column; gap: 8px; }
#foundry-build-timings .bt-card b { color: var(--popover-foreground); font-weight: 600; }
`;

const fmt = (k, v) => (v == null ? "–" : k.time ? (v >= 1e6 ? (v / 1e6).toFixed(1) + " s" : (v / 1e3).toFixed(v < 1e4 ? 1 : 0) + " ms") : String(v));
const el = (parent, tag, text, attrs) => { const e = parent.appendChild(document.createElement(tag)); if (text != null) e.textContent = text; if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openPanel({ telemetry, model }) {
  if (!document.getElementById("foundry-build-timings-style")) el(document.head, "style", STYLE, { id: "foundry-build-timings-style" });
  let dialog = document.getElementById("foundry-build-timings");
  if (!dialog) dialog = el(document.body, "dialog", null, { id: "foundry-build-timings", "aria-label": "Build timings" });
  const draw = async () => {
    dialog.textContent = "";
    el(dialog, "h2", "How fast your builds are");
    // Why, how, what.
    el(dialog, "p", "To show where an app's build is slow, Foundry times each build on this device. The timings stay in this browser and are never sent anywhere.");
    el(dialog, "p", "It notes when you press Enter, when the model starts and finishes writing, when the preview appears and when the check ends. The Foundry kernel lets these notes be kept and shown, and saved only when you ask.");
    let r;
    try { r = await telemetry.report(); } catch (e) { el(dialog, "p", "The timings are unavailable: " + e.message); finish(); return; }
    el(dialog, "p", r.turns.length ? `${r.turns.length} builds are kept on this device, the latest ${model.keepLimit} at most.` : "No build has been timed yet. Build an app and open this again.");

    if (r.switchTo || r.suggestions.length) {
      el(dialog, "h3", "What to change");
      if (r.switchTo) el(dialog, "p", SWITCH_WORDS(r.switchTo.from, r.switchTo.to, r.switchTo.fromRate, r.switchTo.toRate));
      for (const s of r.suggestions) {
        const k = r.kpis.find((x) => x.name === s.kpi), card = el(dialog, "div", null, { class: "bt-card" });
        el(card, "p", null).append(Object.assign(document.createElement("b"), { textContent: k.words.label }), ` was slower than its limit in ${k.observation.over} of ${k.observation.turns} builds, on average ${fmt(k, k.mean)}.`);
        el(card, "p", LEVER_WORDS[s.lever]);
        if (k.loop.applied) el(card, "p", `You made this change. Since then: ${({ improved: "faster", worse: "slower", unchanged: "about the same" })[k.assessment] ?? "no build yet"}.`);
        const row = el(card, "div");
        const adopt = el(row, "button", k.loop.applied ? "Change made" : "I made this change");
        adopt.disabled = !!k.loop.applied;
        adopt.onclick = async () => { await telemetry.adopt(s.kpi); draw(); };
        el(row, "button", "Not now").onclick = async () => { await telemetry.dismiss(s.kpi); draw(); };
      }
    }

    const shown = r.kpis.filter((k) => k.observation.turns > 0 && (k.budget != null || ["think", "lead", "write"].includes(k.name)));
    if (shown.length) {
      el(dialog, "h3", "Your timings");
      const table = el(el(dialog, "div", null, { class: "bt-table" }), "table");
      const head = el(el(table, "thead"), "tr");
      for (const h of ["", "Latest", "Average", "Slowest", "Limit"]) el(head, "th", h);
      const body = el(table, "tbody");
      for (const k of shown) {
        const tr = el(body, "tr"), limit = k.budget == null ? "–" : k.time ? fmt(k, k.threshold).replace(/^/, "under ") : `at most ${k.budget}`;
        [k.words.label, fmt(k, k.last), fmt(k, k.mean), fmt(k, k.observation.worst), limit].forEach((c, i) => el(tr, "td", c, i === 1 && k.overNow ? { class: "bt-over" } : null));
      }
      el(dialog, "p", "A time in red is over the limit the Foundry kernel sets.");
      const models = r.stats.filter((s) => s.reads > 0);
      if (models.length) {
        el(dialog, "h3", "Which model writes apps that read");
        const mt = el(el(dialog, "div", null, { class: "bt-table" }), "table");
        const mh = el(el(mt, "thead"), "tr");
        for (const h of ["Model", "Apps", "At the first try", "After a repair", "Did not read"]) el(mh, "th", h);
        const mb = el(mt, "tbody");
        for (const s of models) {
          const mine = r.turns.filter((t) => t.modelIndex === s.model), sum = (key) => mine.reduce((a, t) => a + (t.kpis[key] ?? 0), 0);
          const tr = el(mb, "tr");
          [r.models[s.model], s.reads, `${sum("firstTry")} (${(model.firstTryPermille(s) / 10).toFixed(0)}%)`, sum("repaired"), sum("refused")].forEach((c) => el(tr, "td", String(c)));
        }
      }
    }

    el(dialog, "h3", "Keep or clear them");
    el(dialog, "p", "Save the timings as a file for Prometheus, or erase them from this device. Nothing is saved or erased until you choose.");
    const files = el(dialog, "div");
    el(files, "button", "Save for Prometheus").onclick = async () => save("prism.prom", await telemetry.exportSnapshot({ userAct: true }), "text/plain; version=0.0.4");
    el(files, "button", "Save history").onclick = async () => save("prism-history.om.txt", await telemetry.exportHistory({ userAct: true }), "application/openmetrics-text; version=1.0.0");
    el(files, "button", "Save alert rules").onclick = () => save("prism.rules.yml", RULES, "text/yaml");
    el(files, "button", "Save builds").onclick = async () => save("prism-turns.json", await telemetry.exportTurns({ userAct: true }), "application/json");
    finish();
  };
  // The answers sit together at the right, the refusal first and the last button the quiet close.
  function finish() {
    const bar = el(dialog, "div");
    // Erasing asks twice inside this dialog, so the question is centred and in the app's look like the rest.
    const erase = el(bar, "button", "Erase everything");
    erase.onclick = async () => {
      if (erase.dataset.sure !== "yes") { erase.dataset.sure = "yes"; erase.textContent = "Erase for good?"; return; }
      await telemetry.erase(); draw();
    };
    const close = el(bar, "button", "Close");
    close.onclick = () => dialog.close();
    close.autofocus = true;
  }
  draw();
  if (!dialog.open) dialog.showModal();
  return { refresh: draw, close: () => dialog.close() };
}
