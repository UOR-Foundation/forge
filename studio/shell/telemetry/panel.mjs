// The telemetry panel, over Forge: the user's own KPIs against the kernel's budgets, reads per model, and
// the loop's suggestions, with saving and erasing. Opened by the host (#telemetry, or Ctrl+Alt+T); it
// reads only through `telemetry` and draws plain DOM. Words are the View's (words.mjs).
import { RULES } from "./prometheus.mjs";
import { KPI_WORDS, LEVER_WORDS, SWITCH_WORDS } from "./words.mjs";

const STYLE = `
.pt-dialog { width: min(1040px, calc(100vw - 32px)); max-height: calc(100vh - 32px); padding: 0; border: 1px solid var(--pt-line); border-radius: 12px; background: var(--pt-bg); color: var(--pt-fg); font: 14px/1.5 system-ui, sans-serif; }
.pt-dialog::backdrop { background: rgb(0 0 0 / 0.4); }
.pt-dialog { --pt-bg: #fafafa; --pt-panel: #fff; --pt-fg: #1b1b1f; --pt-muted: #6b6b75; --pt-line: #e3e3e8; --pt-over: #b42318; --pt-within: #067647; --pt-accent: #3b5bdb; }
:root.dark .pt-dialog, .dark .pt-dialog { --pt-bg: #0f0f12; --pt-panel: #17171c; --pt-fg: #ececf1; --pt-muted: #9b9ba6; --pt-line: #2c2c33; --pt-over: #f97066; --pt-within: #47cd89; --pt-accent: #91a7ff; }
.pt-body { padding: 20px 16px 24px; overflow: auto; max-height: calc(100vh - 34px); }
.pt-dialog h2 { font-size: 18px; margin: 0 0 4px; } .pt-dialog h3 { font-size: 14px; margin: 24px 0 8px; }
.pt-muted { color: var(--pt-muted); }
.pt-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.pt-dialog button { font: inherit; min-height: 36px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--pt-line); background: var(--pt-panel); color: var(--pt-fg); cursor: pointer; }
.pt-dialog button.pt-danger { color: var(--pt-over); } .pt-dialog button:disabled { opacity: .5; cursor: default; }
.pt-scroll { overflow-x: auto; border: 1px solid var(--pt-line); border-radius: 8px; background: var(--pt-panel); }
.pt-dialog table { border-collapse: collapse; width: 100%; min-width: 640px; }
.pt-dialog th, .pt-dialog td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--pt-line); white-space: nowrap; }
.pt-dialog th { font-size: 12px; font-weight: 600; color: var(--pt-muted); } .pt-dialog tr:last-child td { border-bottom: 0; }
.pt-num { text-align: right; font-variant-numeric: tabular-nums; } .pt-over { color: var(--pt-over); font-weight: 600; } .pt-within { color: var(--pt-within); }
.pt-card { border: 1px solid var(--pt-line); border-radius: 8px; background: var(--pt-panel); padding: 12px 14px; margin-bottom: 8px; }
.pt-close { float: right; }
`;

const fmt = (k, v) => (v == null ? "–" : k.time ? (v >= 1e6 ? (v / 1e6).toFixed(2) + " s" : (v / 1e3).toFixed(v < 1e4 ? 2 : 1) + " ms") : String(v));
const el = (parent, tag, text, cls) => { const e = parent.appendChild(document.createElement(tag)); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openPanel({ telemetry, model }) {
  if (!document.getElementById("pt-style")) { const s = el(document.head, "style", STYLE); s.id = "pt-style"; }
  let dialog = document.getElementById("pt-dialog");
  if (!dialog) { dialog = el(document.body, "dialog", null, "pt-dialog"); dialog.id = "pt-dialog"; dialog.setAttribute("aria-label", "Build telemetry"); }
  const body = dialog.firstChild ?? el(dialog, "div", null, "pt-body");
  const draw = async () => {
    body.textContent = "";
    el(body, "button", "Close", "pt-close").onclick = () => dialog.close();
    el(body, "h2", "Build telemetry");
    el(body, "p", "Measured on this device and kept in this browser only. Nothing here is sent anywhere: the Forge kernel lets a record be stored, shown, or saved when you ask, and nothing else.", "pt-muted");
    let r;
    try { r = await telemetry.report(); } catch (e) { el(body, "p", "Telemetry is unavailable: " + e.message, "pt-over"); return; }
    const bar = el(body, "div", null, "pt-bar");
    el(bar, "button", "Save for Prometheus (.prom)").onclick = async () => save("prism.prom", await telemetry.exportSnapshot({ userAct: true }), "text/plain; version=0.0.4");
    el(bar, "button", "Save history (OpenMetrics)").onclick = async () => save("prism-history.om.txt", await telemetry.exportHistory({ userAct: true }), "application/openmetrics-text; version=1.0.0");
    el(bar, "button", "Save alert rules").onclick = () => save("prism.rules.yml", RULES, "text/yaml");
    el(bar, "button", "Save turns (JSON)").onclick = async () => save("prism-turns.json", await telemetry.exportTurns({ userAct: true }), "application/json");
    el(bar, "button", "Erase everything", "pt-danger").onclick = async () => { if (confirm("Erase every telemetry record on this device? This cannot be undone.")) { await telemetry.erase(); draw(); } };
    el(body, "p", `${r.turns.length} build turns stored on this device (at most ${model.keepLimit}).`, "pt-muted");

    el(body, "h3", "Suggestions");
    if (r.switchTo) el(body, "div", SWITCH_WORDS(r.switchTo.from, r.switchTo.to, r.switchTo.fromRate, r.switchTo.toRate), "pt-card");
    for (const s of r.suggestions) {
      const k = r.kpis.find((x) => x.name === s.kpi), card = el(body, "div", null, "pt-card");
      const head = el(card, "div");
      el(head, "strong", k.words.label);
      el(head, "span", ` over budget in ${k.observation.over} of ${k.observation.turns} turns, mean ${fmt(k, k.mean)}`, "pt-muted");
      el(card, "div", LEVER_WORDS[s.lever]);
      if (k.loop.applied) el(card, "div", `You made this change. Since then: ${k.assessment ?? "no turn yet"}.`, "pt-muted");
      const actions = el(card, "div", null, "pt-bar");
      const adopt = el(actions, "button", k.loop.applied ? "Adopted" : "I made this change");
      adopt.disabled = !!k.loop.applied;
      adopt.onclick = async () => { await telemetry.adopt(s.kpi); draw(); };
      el(actions, "button", "Dismiss").onclick = async () => { await telemetry.dismiss(s.kpi); draw(); };
    }
    if (!r.suggestions.length && !r.switchTo) el(body, "p", r.turns.length ? "Nothing is over budget in most turns, so there is nothing to suggest." : "No build turns yet.", "pt-muted");

    el(body, "h3", "Build KPIs against the kernel's budgets");
    const table = el(el(body, "div", null, "pt-scroll"), "table");
    const hr = el(el(table, "thead"), "tr");
    for (const h of ["KPI", "Last", "Mean", "Worst", "Budget", "Last verdict", "Turns over"]) el(hr, "th", h);
    const tb = el(table, "tbody");
    for (const k of r.kpis.filter((k) => k.observation.turns > 0 && (k.budget != null || ["think", "lead", "write"].includes(k.name)))) {
      const tr = el(tb, "tr"), verdict = k.budget == null ? "–" : k.overNow ? "over" : "within";
      const cells = [k.words.label, fmt(k, k.last), fmt(k, k.mean), fmt(k, k.observation.worst), k.budget == null ? "–" : k.time ? `under ${fmt(k, k.threshold)}` : `at most ${k.budget}`, verdict, k.budget == null ? "–" : `${k.observation.over} of ${k.observation.turns}`];
      cells.forEach((c, i) => el(tr, "td", c, i === 5 ? (verdict === "over" ? "pt-over" : verdict === "within" ? "pt-within" : "") : i && i < 5 ? "pt-num" : ""));
    }

    el(body, "h3", "Reads and checks");
    const rt = el(el(body, "div", null, "pt-scroll"), "table");
    const rh = el(el(rt, "thead"), "tr");
    for (const h of ["Model", "Attempts", "Read at the first try", "After one repair", "Refused", "Checks run", "Checks reused"]) el(rh, "th", h);
    const rb = el(rt, "tbody");
    r.stats.forEach((s, i) => {
      const mine = r.turns.filter((t) => t.modelIndex === i), sum = (key) => mine.reduce((a, t) => a + (t.kpis[key] ?? 0), 0);
      const tr = el(rb, "tr");
      [r.models[i], s.reads, `${sum("firstTry")} (${(model.firstTryPermille(s) / 10).toFixed(1)}%)`, sum("repaired"), sum("refused"), sum("rechecked"), sum("reused")].forEach((c, j) => el(tr, "td", String(c), j ? "pt-num" : ""));
    });
  };
  draw();
  if (!dialog.open) dialog.showModal();
  return { refresh: draw, close: () => dialog.close() };
}

export { KPI_WORDS };
