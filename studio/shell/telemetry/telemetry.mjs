// Telemetry: records a turn, reports KPIs with verdicts and the loop's suggestions, runs the loop,
// exports to Prometheus's formats on the user's request, and erases. Decisions are asked of two models
// and never made here: the Forge kernel decides where a record may flow (`telemetry EFFECT ASKED DEVICE`,
// FK-25 to FK-27) and what each journey's budget is (`budget JOURNEY VALUE`); the Telemetry model decides
// everything else. `ask(line)` is the kernel's text question, as window.__forgeKernel.ask answers it.
import { snapshot, history } from "./prometheus.mjs";
import { KPI_WORDS } from "./words.mjs";

export class TelemetryRefused extends Error {
  constructor(code, message) { super(message ?? code); this.code = code; }
}

const BUCKETS = [0, 1, 2, 3, 4];
export const JOURNEYS = ["preview", "declaration", "pixel", "update", "edit", "checked", "built"];

// The kernel answers `within` or `over`, never a number; the budget is the largest value it calls within,
// found by asking (about 32 questions a journey, once per kernel). No copy of the numbers exists here.
export async function kernelBudgets(ask) {
  const out = {};
  for (const journey of JOURNEYS) {
    const within = async (v) => { const a = await ask(`budget ${journey} ${v}`); if (a !== "within" && a !== "over") throw new TelemetryRefused("telemetry.noBudget", `the kernel has no budget for ${journey}: ${a}`); return a === "within"; };
    if (!(await within(0))) throw new TelemetryRefused("telemetry.noBudget", journey);
    let lo = 0, hi = 2 ** 31;
    if (await within(hi)) throw new TelemetryRefused("telemetry.noBudget", journey + " has no upper bound");
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (await within(mid)) lo = mid; else hi = mid; }
    out[journey] = lo;
  }
  return out;
}

export function createTelemetry({ model, backend, ask }) {
  const { KPI, LEVER, LOOP } = model;
  const names = Object.fromEntries(Object.entries(KPI).map(([n, c]) => [c, n]));
  const leverName = Object.fromEntries(Object.entries(LEVER).map(([n, c]) => [c, n]));
  let budgets = null;
  const budgetTable = async () => (budgets ??= await kernelBudgets(ask));
  // A KPI's budget: the kernel's for the build journeys, the model's own for reloads.
  const budgetOf = (table, code) => (!model.budgeted(code) ? null : code === KPI.reloads ? model.reloadBudget : table[names[code]]);
  // Every flow of a record is asked of the kernel first; anything but `allow` is a typed refusal and
  // nothing moves. Telemetry never runs a model, so it always asks with DEVICE no.
  const flow = async (effect, asked = false) => {
    const answer = await ask(`telemetry ${effect} ${asked ? "yes" : "no"} no`);
    if (answer !== "allow") throw new TelemetryRefused("telemetry.flowRefused", `the kernel does not let telemetry ${effect}: ${answer}`);
  };

  async function modelIndex(name) {
    const models = (await backend.getMeta("models")) ?? [];
    let i = models.indexOf(name);
    if (i < 0) { models.push(name); i = models.length - 1; await backend.setMeta("models", models); }
    return i;
  }

  async function record({ events, dropped = 0, model: modelName = "unknown" }) {
    await flow("store");
    if (!events.length) throw new TelemetryRefused("telemetry.emptyTurn", "a turn with no events is not recorded");
    const index = await modelIndex(modelName);
    const at = Math.min(...events.map((e) => e[1]));
    const turn = { id: at, at, model: index, events: events.map((e) => [e[0], e[1], e[2], index]), dropped };
    await backend.put(turn);
    const all = await backend.all();
    const evict = model.evicted(all.length);
    if (evict > 0) await backend.remove(all.slice(0, evict).map((t) => t.id));
    return turn;
  }

  async function dataset() {
    const table = await budgetTable();
    const turns = await backend.all(), models = (await backend.getMeta("models")) ?? [];
    const rows = turns.map((t) => {
      const values = model.kpis(t.events), kpis = {}, over = {};
      for (const [code, v] of Object.entries(values)) {
        kpis[names[code]] = v;
        const b = budgetOf(table, Number(code));
        if (v != null && b != null) over[names[code]] = model.over(Number(code), v, b);
      }
      return { id: t.id, at: t.at, model: models[t.model] ?? "unknown", modelIndex: t.model, kpis, over, dropped: t.dropped };
    });
    const kpis = Object.entries(KPI).map(([name, code]) => {
      const budget = budgetOf(table, code), time = KPI_WORDS[name].unit === "time";
      return { name, code, time, budget, threshold: budget != null && time ? model.budgetMicros(budget) : null, buckets: budget != null && time ? BUCKETS.map((i) => model.bucketMicros(budget, i)) : null };
    });
    return { turns: rows, kpis, models };
  }

  async function report() {
    await flow("show");
    const data = await dataset();
    const loops = (await backend.getMeta("loop")) ?? {};
    const totals = (name) => model.observe(KPI[name], data.turns.map((t) => t.kpis[name]).filter((v) => v != null), 0).total;
    const stages = { think: totals("think"), lead: totals("lead"), write: totals("write"), check: totals("checked") };
    const kpis = data.kpis.map((k) => {
      const values = data.turns.map((t) => t.kpis[k.name]).filter((v) => v != null);
      const observation = model.observe(k.code, values, k.budget ?? 0);
      const lever = k.budget != null ? model.lever(observation, stages) : 0;
      const loop = loops[k.name] ?? { applied: 0, pending: 0, baseline: 0, adoptedAt: null };
      const mean = observation.turns ? Math.round(observation.total / observation.turns) : 0;
      let assessment = null;
      if (loop.applied && loop.adoptedAt != null) {
        const after = data.turns.filter((t) => t.at > loop.adoptedAt).map((t) => t.kpis[k.name]).filter((v) => v != null);
        if (after.length) assessment = ["unchanged", "improved", "worse"][model.assess(loop.baseline, Math.round(after.reduce((a, b) => a + b, 0) / after.length))];
      }
      return { ...k, words: KPI_WORDS[k.name], observation, mean, last: values.length ? values[values.length - 1] : null,
        overNow: values.length && k.budget != null ? model.over(k.code, values[values.length - 1], k.budget) : false,
        lever: leverName[lever], severity: lever ? model.severity(observation) : 0, loop, assessment };
    });
    const suggestions = kpis.filter((k) => k.lever !== "none").sort((a, b) => b.severity - a.severity || a.code - b.code).map((k) => ({ kpi: k.name, lever: k.lever, severity: k.severity }));
    const stats = data.models.map((_, i) => {
      const mine = data.turns.filter((t) => t.modelIndex === i);
      const sum = (key) => mine.reduce((a, t) => a + (t.kpis[key] ?? 0), 0);
      return { model: i, reads: sum("firstTry") + sum("repaired") + sum("refused"), firstTry: sum("firstTry") };
    });
    const current = data.turns.length ? data.turns[data.turns.length - 1].modelIndex : null;
    const built = kpis.find((k) => k.name === "built").observation;
    const pick = current == null ? null : model.switchTo(stats[current], stats.filter((s) => s.model !== current), built);
    const switchTo = pick == null ? null : { from: data.models[current], to: data.models[pick], fromRate: model.firstTryPermille(stats[current]), toRate: model.firstTryPermille(stats[pick]) };
    return { turns: data.turns, kpis, suggestions, switchTo, models: data.models, stats };
  }

  // The loop. Offering, adopting and dismissing change the loop's record and nothing else (TL-18): adopting
  // is the user's note that they made the change; the loop then compares the KPI's mean before and after.
  async function act(kpiName, event) {
    const r = await report();
    const k = r.kpis.find((x) => x.name === kpiName);
    if (!k) throw new TelemetryRefused("telemetry.unknownKpi", kpiName);
    const loops = (await backend.getMeta("loop")) ?? {};
    let loop = loops[kpiName] ?? { applied: 0, pending: 0, baseline: 0, adoptedAt: null };
    loop = { ...loop, ...model.loopStep(loop, LOOP.offer, LEVER[k.lever], k.mean) };
    const before = loop.applied;
    loop = { ...loop, ...model.loopStep(loop, LOOP[event], 0, k.mean) };
    if (loop.applied !== before) loop.adoptedAt = r.turns.length ? r.turns[r.turns.length - 1].at : 0;
    loops[kpiName] = loop;
    await backend.setMeta("loop", loops);
    return loop;
  }

  // Saving is the one flow that needs the user: `asked` is true only from their click (FK-26).
  async function exportAs(format, { userAct = false } = {}) {
    await flow("save", userAct === true);
    const r = await report(), data = await dataset();
    const set = { kpis: data.kpis, turns: data.turns, suggestions: r.suggestions };
    return format === "openmetrics" ? history(set) : snapshot(set);
  }

  // Captured turns, as recorded, for replaying elsewhere; a save like any other.
  async function exportTurns({ userAct = false } = {}) {
    await flow("save", userAct === true);
    return JSON.stringify({ spec: "prism/telemetry-turns/1", models: (await backend.getMeta("models")) ?? [], turns: await backend.all() }) + "\n";
  }

  return {
    record, report, dataset, budgets: budgetTable,
    adopt: (kpi) => act(kpi, "approve"),
    dismiss: (kpi) => act(kpi, "dismiss"),
    exportSnapshot: (act) => exportAs("text", act),
    exportHistory: (act) => exportAs("openmetrics", act),
    exportTurns,
    erase: () => backend.erase(),
  };
}
