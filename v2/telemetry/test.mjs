// Run: node --test v2/telemetry/test.mjs
// Every decision tested here is made by the Telemetry model's data form (data/*.json) through the
// interpreter; the tests hold the adapters to it and the model to the owner's KPI definitions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadModelNode } from "./model.mjs";
import { createTelemetry } from "./telemetry.mjs";
import { memoryBackend } from "./store.mjs";
import { createProbe, CAPACITY } from "./probe.mjs";
import { fixtureTurns } from "./fixtures.mjs";
import { snapshot, history, seconds } from "./prometheus.mjs";
import { scan } from "./egress-gate.mjs";

const model = await loadModelNode();
const budgets = JSON.parse(readFileSync(new URL("./budgets.json", import.meta.url), "utf8")).budgets;
const { KIND, KPI, LEVER, EFFECT, LOOP } = model;
const make = () => createTelemetry({ model, backend: memoryBackend(), budgets });

// One turn, written out by hand: Enter at 1 s; every span is a round number of microseconds.
const T0 = 1_000_000;
const turn = () => [
  [KIND.enter, T0, 0, 0], [KIND.frame, T0 + 1_300_000, 0, 0], [KIND.token, T0 + 80_000_000, 0, 0],
  [KIND.declaration, T0 + 99_000_000, 0, 0], [KIND.pixel, T0 + 99_031_000, 0, 0],
  [KIND.update, T0 + 99_031_001, 4_800, 0], [KIND.update, T0 + 99_051_001, 8_500, 0], [KIND.update, T0 + 99_071_001, 6_000, 0],
  [KIND.complete, T0 + 169_000_000, 0, 0], [KIND.read, T0 + 169_040_000, 1, 0], [KIND.rechecked, T0 + 169_040_000, 0, 0], [KIND.checked, T0 + 169_041_000, 0, 0],
  [KIND.edit, T0 + 174_000_000, 0, 0], [KIND.editScreen, T0 + 174_016_000, 0, 0], [KIND.edit, T0 + 175_000_000, 0, 0], [KIND.editScreen, T0 + 175_025_000, 0, 0],
];

test("the model's codes are the ones the adapters and fixtures name", () => {
  assert.deepEqual(Object.keys(KIND), ["enter", "token", "frame", "declaration", "pixel", "update", "edit", "editScreen", "complete", "checked", "reload", "read", "refused", "reused", "rechecked"]);
  assert.deepEqual(Object.keys(KPI), ["preview", "declaration", "pixel", "update", "edit", "checked", "built", "reloads", "think", "lead", "write", "firstTry", "repaired", "refused", "reused", "rechecked"]);
  assert.deepEqual(Object.keys(EFFECT), ["store", "show", "save", "fetch", "infer", "serve", "frame"]);
  assert.deepEqual(Object.keys(LOOP), ["offer", "approve", "dismiss"]);
  assert.equal(model.theorems.length, 15);
});

test("every KPI the owner tracks, as a function of events, to the microsecond", () => {
  const k = model.kpis(turn());
  const get = (n) => k[KPI[n]];
  assert.equal(get("preview"), 1_300_000);
  assert.equal(get("declaration"), 99_000_000);
  assert.equal(get("pixel"), 31_000);
  assert.equal(get("update"), 8_500, "work per update is the turn's worst");
  assert.equal(get("edit"), 25_000, "edit to screen is the turn's worst edit");
  assert.equal(get("checked"), 41_000);
  assert.equal(get("built"), 169_041_000);
  assert.equal(get("reloads"), 0);
  assert.equal(get("think"), 80_000_000);
  assert.equal(get("lead"), 19_000_000);
  assert.equal(get("write"), 70_000_000);
  assert.equal(get("firstTry"), 1);
  assert.equal(get("repaired"), 0);
  assert.equal(get("rechecked"), 1);
  assert.equal(get("reused"), 0);
});

test("events from several contexts arrive out of order and give the same KPIs", () => {
  const events = turn(), shuffled = [...events].reverse();
  assert.deepEqual(model.kpis(shuffled), model.kpis(events));
});

test("a journey that did not happen is absent, not zero", () => {
  const k = model.kpis([[KIND.enter, T0, 0, 0], [KIND.frame, T0 + 5, 0, 0]]);
  assert.equal(k[KPI.preview], 5);
  for (const n of ["declaration", "pixel", "update", "edit", "checked", "built"]) assert.equal(k[KPI[n]], null, n);
  assert.equal(model.kpis([[KIND.frame, T0, 0, 0]])[KPI.preview], null, "a frame without Enter is no preview journey");
  assert.equal(model.kpis([[KIND.enter, T0 + 10, 0, 0], [KIND.frame, T0, 0, 0]])[KPI.preview], null, "a frame before Enter does not count");
});

test("a full probe ring (1,024 events) is read in well under a second", () => {
  const events = [[KIND.enter, T0, 0, 0]];
  for (let i = 0; events.length < CAPACITY; i++) events.push([KIND.update, T0 + i + 1, i % 97, 0], [KIND.pixel, T0 + i + 1, 0, 0]);
  const t0 = performance.now();
  assert.equal(model.kpis(events)[KPI.update], 96);
  assert.ok(performance.now() - t0 < 1000, "took " + (performance.now() - t0) + " ms");
});

test("verdicts agree with the kernel's: over exactly when budget < whole milliseconds", () => {
  for (const [name, budget] of Object.entries(budgets)) {
    const code = KPI[name];
    for (const us of [0, 1, budget * 1000, budget * 1000 + 999, (budget + 1) * 1000 - 1, (budget + 1) * 1000, (budget + 1) * 1000 + 1, budget * 4000]) {
      assert.equal(model.over(code, us, budget), budget < Math.floor(us / 1000), `${name} ${us} us`);
    }
  }
  assert.equal(model.over(KPI.reloads, 0, model.reloadBudget), false);
  assert.equal(model.over(KPI.reloads, 1, model.reloadBudget), true);
});

test("histogram buckets are a quarter to four times the threshold, and the third is the threshold", () => {
  for (const budget of Object.values(budgets)) {
    const b = [0, 1, 2, 3, 4].map((i) => model.bucketMicros(budget, i));
    assert.deepEqual(b, [250, 500, 1000, 2000, 4000].map((f) => (budget + 1) * f));
    assert.equal(b[2], model.budgetMicros(budget));
  }
});

test("the loop on the hand-measured turns: declaration and built, with the switch to the better reader", async () => {
  const t = make();
  for (const f of fixtureTurns(KIND)) await t.record(f);
  const r = await t.report();
  assert.equal(r.turns.length, 11);
  assert.deepEqual(r.suggestions.map((s) => [s.kpi, s.lever]), [["declaration", "reasoning"], ["built", "reasoning"]]);
  assert.deepEqual(r.switchTo, { from: "model-a", to: "model-b", fromRate: 333, toRate: 1000 });
  for (const k of r.kpis.filter((k) => k.budget != null && !["declaration", "built"].includes(k.name))) assert.equal(k.lever, "none", k.name);
});

test("a majority of turns must be over; one slow turn among fast ones is noise", async () => {
  const o = (over, turns, kpi = KPI.pixel) => ({ kpi, turns, over, worst: 0, total: 0, last: 0 });
  const s = { think: 0, lead: 0, write: 0, check: 0 };
  assert.equal(model.lever(o(1, 1), s), LEVER.projectEarly);
  assert.equal(model.lever(o(1, 2), s), LEVER.none);
  assert.equal(model.lever(o(2, 3), s), LEVER.projectEarly);
  assert.equal(model.lever(o(0, 0), s), LEVER.none);
  assert.equal(model.lever(o(5, 5, KPI.think), s), LEVER.none, "no budget, no suggestion");
  assert.equal(model.lever(o(3, 3, KPI.built), { think: 1, lead: 2, write: 9, check: 3 }), LEVER.shorterModule);
  assert.equal(model.lever(o(3, 3, KPI.built), { think: 1, lead: 2, write: 3, check: 9 }), LEVER.reuseChecks);
  assert.equal(model.lever(o(3, 3, KPI.declaration), { think: 1, lead: 9, write: 0, check: 0 }), LEVER.declarationsFirst);
});

test("the model switch: never the current model, never on few samples, never within budget", () => {
  const built = { kpi: KPI.built, turns: 3, over: 3, worst: 0, total: 0, last: 0 };
  const a = { model: 0, reads: 6, firstTry: 2 }, b = { model: 1, reads: 6, firstTry: 6 };
  assert.equal(model.switchTo(a, [b], built), 1);
  assert.equal(model.switchTo(a, [{ ...b, reads: 4, firstTry: 4 }], built), null);
  assert.equal(model.switchTo(a, [{ ...b, model: 0 }], built), null);
  assert.equal(model.switchTo(a, [b], { ...built, over: 0 }), null);
  assert.equal(model.switchTo(b, [a], built), null, "a worse reader is never suggested");
  assert.equal(model.switchTo(a, [b, { model: 2, reads: 9, firstTry: 8 }], built), 1, "the best first-try rate wins");
});

test("the loop is advisory: only approval adopts, and the loop judges before against after", async () => {
  const l0 = { applied: 0, pending: 0, baseline: 0 };
  const offered = model.loopStep(l0, LOOP.offer, LEVER.reasoning, 120);
  assert.deepEqual(offered, { applied: 0, pending: LEVER.reasoning, baseline: 120 });
  assert.deepEqual(model.loopStep(offered, LOOP.dismiss, 0, 0), { applied: 0, pending: 0, baseline: 120 });
  assert.deepEqual(model.loopStep(offered, LOOP.approve, 0, 0), { applied: LEVER.reasoning, pending: 0, baseline: 120 });
  assert.deepEqual(model.loopStep(l0, LOOP.approve, 0, 0), l0, "nothing to approve");
  assert.equal(model.assess(100, 90), 1);
  assert.equal(model.assess(100, 97), 0);
  assert.equal(model.assess(100, 110), 2);

  const t = make();
  for (const f of fixtureTurns(KIND)) await t.record(f);
  const loop = await t.adopt("declaration");
  assert.equal(loop.applied, LEVER.reasoning);
  assert.equal((await t.report()).kpis.find((k) => k.name === "declaration").assessment, null, "no turn since adoption yet");
  const later = fixtureTurns(KIND, Date.UTC(2026, 10, 12) * 1000)[0];
  later.events = later.events.map((e) => (e[0] === KIND.token ? [e[0], e[1] - 70e6, e[2], e[3]] : e[0] === KIND.declaration || e[0] === KIND.pixel || e[0] === KIND.update ? [e[0], e[1] - 70e6, e[2], e[3]] : e));
  await t.record(later);
  assert.equal((await t.report()).kpis.find((k) => k.name === "declaration").assessment, "improved");
  const dismissed = await t.dismiss("built");
  assert.equal(dismissed.applied, 0);
});

test("what a record may flow into: store, show, a save the user asked for, an on-device model", () => {
  const allowed = (effect, userAct, onDevice) => model.flowAllows(EFFECT[effect], userAct, onDevice);
  for (const [userAct, onDevice] of [[false, false], [true, false], [false, true], [true, true]]) {
    assert.equal(allowed("store", userAct, onDevice), true);
    assert.equal(allowed("show", userAct, onDevice), true);
    assert.equal(allowed("save", userAct, onDevice), userAct);
    assert.equal(allowed("infer", userAct, onDevice), onDevice);
    for (const e of ["fetch", "serve", "frame"]) assert.equal(allowed(e, userAct, onDevice), false, e);
  }
  for (let e = 7; e < 20; e++) assert.equal(model.flowAllows(e, true, true), false, "unknown effect " + e);
});

test("retention: at most 512 turns, the oldest go first", async () => {
  const t = make();
  for (let i = 0; i < 515; i++) await t.record({ events: [[KIND.enter, 1e6 + i * 1e6, 0, 0], [KIND.frame, 1e6 + i * 1e6 + 10, 0, 0]], model: "m" });
  const r = await t.report();
  assert.equal(r.turns.length, 512);
  assert.equal(r.turns[0].at, 1e6 + 3 * 1e6);
});

test("typed refusals: an empty turn, a save the user did not ask for", async () => {
  const t = make();
  await assert.rejects(t.record({ events: [] }), { code: "telemetry.emptyTurn" });
  await t.record({ events: turn(), model: "m" });
  await assert.rejects(t.exportSnapshot(), { code: "telemetry.flowRefused" });
  await assert.rejects(t.exportHistory({ userAct: "yes" }), { code: "telemetry.flowRefused" });
  assert.match(await t.exportSnapshot({ userAct: true }), /prism_kpi_seconds/);
});

test("erase leaves nothing", async () => {
  const t = make();
  await t.record({ events: turn(), model: "m" });
  await t.erase();
  assert.equal((await t.report()).turns.length, 0);
  assert.equal((await t.report()).models.length, 0);
});

test("seconds are written exactly, never through a float", () => {
  assert.equal(seconds(0), "0");
  assert.equal(seconds(1), "0.000001");
  assert.equal(seconds(1_300_000), "1.3");
  assert.equal(seconds(169_041_000), "169.041");
  assert.equal(seconds(1_794_486_222_948_123), "1794486222.948123");
  assert.throws(() => seconds(1.5));
  assert.throws(() => seconds(-1));
});

test("Prometheus text format 0.0.4: one sample per series, counters end in _total, no timestamps", async () => {
  const t = make();
  await t.record({ events: turn(), model: 'model "a"\\x' });
  const text = await t.exportSnapshot({ userAct: true });
  const lines = text.trim().split("\n");
  assert.ok(lines.includes('prism_kpi_seconds{kpi="preview"} 1.3'));
  assert.ok(lines.includes('prism_kpi_seconds{kpi="update"} 0.0085'));
  assert.ok(lines.includes('prism_kpi_threshold_seconds{kpi="update"} 0.016'));
  assert.ok(lines.includes('prism_kpi_duration_seconds_bucket{kpi="update",le="0.016"} 1'));
  assert.ok(lines.includes('prism_kpi_duration_seconds_bucket{kpi="update",le="+Inf"} 1'));
  assert.ok(lines.includes('prism_kpi_over_budget_turns_total{kpi="declaration"} 1'));
  assert.ok(lines.includes('prism_module_reads_total{model="model \\"a\\"\\\\x",attempt="first"} 1'), "label values escaped");
  assert.ok(lines.includes("# TYPE prism_preview_reloads_total counter"));
  assert.ok(lines.includes('prism_suggestion_info{kpi="declaration",lever="reasoning"} 1'));
  for (const l of lines.filter((l) => !l.startsWith("#"))) assert.match(l, /^[a-z_:][a-z0-9_:]*(\{[^}]*\})? [0-9.+Inf]+$/, l);
  assert.ok(!text.includes("# EOF"));
});

test("OpenMetrics history: typed families, one point per turn in time order, histograms cumulative, # EOF", async () => {
  const t = make();
  for (const f of fixtureTurns(KIND)) await t.record(f);
  const text = await t.exportHistory({ userAct: true });
  assert.ok(text.endsWith("# EOF\n"));
  assert.ok(text.includes("# TYPE prism_preview_reloads counter") && text.includes("# UNIT prism_kpi_seconds seconds"));
  const series = new Map();
  for (const l of text.split("\n").filter((l) => l && !l.startsWith("#"))) {
    const m = /^(\S+?)(\{[^}]*\})? (\S+) (\S+)$/.exec(l);
    assert.ok(m, "every sample has a timestamp: " + l);
    const key = m[1] + (m[2] ?? ""), list = series.get(key) ?? [];
    list.push([Number(m[4]), Number(m[3])]); series.set(key, list);
  }
  for (const [key, points] of series) {
    for (let i = 1; i < points.length; i++) assert.ok(points[i][0] > points[i - 1][0], "time order: " + key);
    if (/_(total|bucket|count|sum)\{/.test(key) || key.endsWith("_total")) for (let i = 1; i < points.length; i++) assert.ok(points[i][1] >= points[i - 1][1], "counter never decreases: " + key);
  }
  const count = series.get('prism_kpi_duration_seconds_count{kpi="built"}');
  assert.deepEqual(count.map((p) => p[1]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(series.get('prism_kpi_duration_seconds_bucket{kpi="built",le="+Inf"}').map((p) => p[1]), count.map((p) => p[1]));
});

test("the probe: microseconds, no overwrite when full, drained per turn, well under a frame", () => {
  const p = createProbe(3);
  p.mark(KIND.enter); p.mark(KIND.frame, 0, 0, 42); p.mark(KIND.update, 7); p.mark(KIND.update, 8);
  const out = p.drain();
  assert.equal(out.events.length, 3);
  assert.equal(out.dropped, 1);
  assert.deepEqual(out.events[1], [KIND.frame, 42, 0, 0]);
  assert.ok(Number.isSafeInteger(out.events[0][1]));
  assert.equal(p.size, 0);
  const big = createProbe(200_000), t0 = performance.now();
  for (let i = 0; i < 200_000; i++) big.mark(5, i);
  const ns = ((performance.now() - t0) * 1e6) / 200_000;
  assert.ok(ns < 5_000, `a mark cost ${ns} ns`);
});

test("zero egress at run time: recording, reporting, the loop and both exports touch no network API", async () => {
  const touched = [];
  const trip = (name) => function () { touched.push(name); throw new Error("egress: " + name); };
  const saved = {};
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]) { saved[name] = globalThis[name]; globalThis[name] = trip(name); }
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: trip("sendBeacon") } });
  try {
    const t = make();
    for (const f of fixtureTurns(KIND)) await t.record(f);
    await t.report(); await t.adopt("declaration"); await t.dismiss("built");
    await t.exportSnapshot({ userAct: true }); await t.exportHistory({ userAct: true });
    await t.erase();
  } finally {
    for (const [name, v] of Object.entries(saved)) globalThis[name] = v;
    if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator;
  }
  assert.deepEqual(touched, []);
});

test("zero egress in the source: the static gate finds nothing", () => {
  assert.deepEqual(scan(), []);
});
