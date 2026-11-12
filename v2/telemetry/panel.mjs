// The in-tab panel: replays a build turn, shows the KPIs, the verdicts and the loop's suggestions, and
// saves Prometheus files when the user asks. It reads files from this origin only.
import { fromData } from "./model.mjs";
// Data arrives as script modules: under this page's policy (connect-src 'none') even a JSON module is a
// connection, so serve.mjs hands each JSON file out as `export default <json>` at <file>.mjs.
import Telemetry from "./data/Telemetry.json.mjs";
import TelemetryProofs from "./data/TelemetryProofs.json.mjs";
import budgetFile from "./budgets.json.mjs";
// The replayed answer: the shell's fixture module, as text.
import replayModule from "./replay-module.json.mjs";
import { createTelemetry } from "./telemetry.mjs";
import { indexedDbBackend } from "./store.mjs";
import { createProbe, now } from "./probe.mjs";
import { replayTurn } from "./replay.mjs";
import { fixtureTurns } from "./fixtures.mjs";
import { RULES, seconds } from "./prometheus.mjs";
import { LEVER_WORDS, SWITCH_WORDS } from "./words.mjs";

const $ = (id) => document.getElementById(id);
const model = fromData({ Telemetry, TelemetryProofs });
const budgets = budgetFile.budgets;
const moduleText = replayModule.text;
const telemetry = createTelemetry({ model, backend: indexedDbBackend(), budgets });
const probe = createProbe();
window.__telemetry = { telemetry, model, probe };

const fmt = (k, v) => (v == null ? "–" : k.time ? (v >= 1e6 ? (v / 1e6).toFixed(2) + " s" : (v / 1e3).toFixed(v < 1e4 ? 2 : 1) + " ms") : String(v));
const status = (text) => { $("status").textContent = text; };

async function draw() {
  const r = await telemetry.report();
  const shown = r.kpis.filter((k) => k.observation.turns > 0 && (k.budget != null || ["think", "lead", "write"].includes(k.name)));
  $("kpis").innerHTML = "";
  for (const k of shown) {
    const tr = document.createElement("tr");
    const verdict = k.budget == null ? "–" : k.overNow ? "over" : "within";
    const cells = [k.words.label, fmt(k, k.last), fmt(k, k.mean), fmt(k, k.observation.worst),
      k.budget == null ? "–" : k.time ? `under ${fmt(k, k.threshold)}` : `at most ${k.budget}`, verdict,
      k.budget == null ? "–" : `${k.observation.over} of ${k.observation.turns}`];
    cells.forEach((c, i) => { const td = tr.appendChild(document.createElement("td")); td.textContent = c; if (i && i < 5) td.className = "num"; if (i === 5) td.className = verdict === "over" ? "over" : verdict === "within" ? "within" : ""; });
    $("kpis").appendChild(tr);
  }
  $("models").innerHTML = "";
  r.stats.forEach((s, i) => {
    const mine = r.turns.filter((t) => t.modelIndex === i);
    const sum = (key) => mine.reduce((a, t) => a + (t.kpis[key] ?? 0), 0);
    const tr = document.createElement("tr");
    [r.models[i], s.reads, `${sum("firstTry")} (${(model.firstTryPermille(s) / 10).toFixed(1)}%)`, sum("repaired"), sum("refused")].forEach((c, j) => { const td = tr.appendChild(document.createElement("td")); td.textContent = c; if (j) td.className = "num"; });
    $("models").appendChild(tr);
  });
  const box = $("suggestions");
  box.innerHTML = "";
  if (r.switchTo) { const c = box.appendChild(document.createElement("div")); c.className = "card"; c.textContent = SWITCH_WORDS(r.switchTo.from, r.switchTo.to, r.switchTo.fromRate, r.switchTo.toRate); }
  for (const s of r.suggestions) {
    const k = r.kpis.find((x) => x.name === s.kpi);
    const c = box.appendChild(document.createElement("div")); c.className = "card";
    const head = c.appendChild(document.createElement("div"));
    head.innerHTML = `<strong></strong> <span class="muted"></span>`;
    head.firstChild.textContent = k.words.label;
    head.lastChild.textContent = `over budget in ${k.observation.over} of ${k.observation.turns} turns, mean ${fmt(k, k.mean)}`;
    c.appendChild(document.createElement("div")).textContent = LEVER_WORDS[s.lever];
    const note = c.appendChild(document.createElement("div")); note.className = "muted";
    if (k.loop.applied) note.textContent = `You adopted this. Since then: ${k.assessment ?? "no turn yet"}.`;
    const actions = c.appendChild(document.createElement("div")); actions.className = "actions";
    const adopt = actions.appendChild(document.createElement("button")); adopt.textContent = k.loop.applied ? "Adopted" : "I made this change"; adopt.disabled = !!k.loop.applied;
    adopt.onclick = async () => { await telemetry.adopt(s.kpi); draw(); };
    const dismiss = actions.appendChild(document.createElement("button")); dismiss.textContent = "Dismiss";
    dismiss.onclick = async () => { await telemetry.dismiss(s.kpi); draw(); };
  }
  if (!box.children.length) box.textContent = r.turns.length ? "Nothing is over budget in most turns, so the loop suggests nothing." : "None yet.";
  status(`${r.turns.length} turns stored on this device (at most ${model.keepLimit}).`);
}

function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("replay").onclick = async () => {
  $("replay").disabled = true; status("Replaying…");
  try {
    const turn = await replayTurn({ probe, KIND: model.KIND, container: $("frame"), moduleText, speed: Number($("speed").value) });
    await telemetry.record({ events: turn.events, dropped: turn.dropped, model: "model-a" });
    await draw();
    status(`Replayed: ${turn.events.length} events, ${turn.paints} paints, ${turn.loads} frame load. ` + $("status").textContent);
  } catch (e) { status("Replay failed: " + e.message); }
  $("replay").disabled = false;
};
$("seed").onclick = async () => { for (const t of fixtureTurns(model.KIND)) await telemetry.record(t); draw(); };
$("snapshot").onclick = async () => save("prism.prom", await telemetry.exportSnapshot({ userAct: true }), "text/plain; version=0.0.4");
$("history").onclick = async () => save("prism-history.om.txt", await telemetry.exportHistory({ userAct: true }), "application/openmetrics-text; version=1.0.0");
$("rules").onclick = () => save("prism.rules.yml", RULES, "text/yaml");
$("erase").onclick = async () => { if (confirm("Erase every telemetry record on this device? This cannot be undone.")) { await telemetry.erase(); draw(); } };

// The probe's own cost, measured here: 100,000 marks into a scratch probe.
{
  const scratch = createProbe(100000), t0 = performance.now();
  for (let i = 0; i < 100000; i++) scratch.mark(5, i);
  const ns = ((performance.now() - t0) * 1e6) / 100000;
  $("probe").textContent = `A mark costs about ${ns.toFixed(0)} ns here (100,000 marks). Clock: performance.timeOrigin + performance.now(), resolution ${crossOriginIsolated ? "5 µs (cross-origin isolated)" : "100 µs or coarser (not cross-origin isolated)"}; now ${seconds(now())} s.`;
}
draw();
