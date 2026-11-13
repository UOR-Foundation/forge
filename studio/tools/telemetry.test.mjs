// Run: node --test studio/tools/telemetry.test.mjs
// Build telemetry (TL-01 to TL-21 in the Telemetry model, FK-25 to FK-27 in the Forge kernel). Every
// decision tested here is made by a model: the Telemetry model's data form through the shell's
// interpreter, and the pinned kernel guest (studio/shell/kernel) for flows and budgets. Nothing here
// keeps a number or a rule of its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { fromData } from "../shell/telemetry/model.mjs";
import { createTelemetry, kernelBudgets, JOURNEYS } from "../shell/telemetry/telemetry.mjs";
import { memoryBackend } from "../shell/telemetry/store.mjs";
import { createProbe, CAPACITY } from "../shell/telemetry/probe.mjs";
import { seconds } from "../shell/telemetry/prometheus.mjs";
import { fixtureTurns } from "./fixtures/telemetry_turns.mjs";
import { scan } from "./telemetry_egress.mjs";

// The kernel the shell runs: studio/shell/kernel, loaded exactly as kernel_boundary.test.mjs loads it.
const kernelScope = {};
vm.runInNewContext(fs.readFileSync(new URL("../shell/kernel.js", import.meta.url), "utf8"), { self: kernelScope, crypto: webcrypto, WebAssembly, TextEncoder, TextDecoder, Uint8Array, atob });
const kernel = await kernelScope.ForgeKernel.load(async (path) => new Response(fs.readFileSync(new URL("../shell/" + path, import.meta.url))));
const ask = (line) => kernel.ask(line);

const data = (name) => JSON.parse(fs.readFileSync(new URL("../shell/telemetry/data/" + name + ".json", import.meta.url), "utf8"));
const model = fromData(Object.fromEntries(data("modules").map((n) => [n, data(n)])));
const budgets = await kernelBudgets(ask);
const { KIND, KPI, LEVER, LOOP } = model;
const make = () => createTelemetry({ model, backend: memoryBackend(), ask });

const T0 = 1_000_000;
const turn = () => [
  [KIND.enter, T0, 0, 0], [KIND.frame, T0 + 1_300_000, 0, 0], [KIND.token, T0 + 80_000_000, 0, 0],
  [KIND.declaration, T0 + 99_000_000, 0, 0], [KIND.pixel, T0 + 99_031_000, 0, 0],
  [KIND.update, T0 + 99_031_001, 4_800, 0], [KIND.update, T0 + 99_051_001, 8_500, 0], [KIND.update, T0 + 99_071_001, 6_000, 0],
  [KIND.complete, T0 + 169_000_000, 0, 0], [KIND.read, T0 + 169_040_000, 1, 0], [KIND.rechecked, T0 + 169_040_000, 0, 0], [KIND.checked, T0 + 169_041_000, 0, 0],
  [KIND.edit, T0 + 174_000_000, 0, 0], [KIND.editScreen, T0 + 174_016_000, 0, 0], [KIND.edit, T0 + 175_000_000, 0, 0], [KIND.editScreen, T0 + 175_025_000, 0, 0],
];

test("FK-25 to FK-27: the kernel lets a record be stored, shown, saved when asked, or read by an on-device model, and nothing else", async () => {
  for (const asked of ["no", "yes"]) for (const device of ["no", "yes"]) {
    const a = (effect) => ask(`telemetry ${effect} ${asked} ${device}`);
    assert.equal(await a("store"), "allow");
    assert.equal(await a("show"), "allow");
    assert.equal(await a("save"), asked === "yes" ? "allow" : "deny");
    assert.equal(await a("infer"), device === "yes" ? "allow" : "deny");
    for (const e of ["fetch", "serve", "frame"]) assert.equal(await a(e), "deny", e);
  }
  for (const bad of ["telemetry beacon no no", "telemetry store no", "telemetry store no no no", "telemetry store maybe no", "telemetry"]) assert.equal(await ask(bad), "invalid", bad);
});

test("the budgets are the kernel's, found by asking it: no copy exists", () => {
  assert.deepEqual(Object.keys(budgets), JOURNEYS);
  assert.deepEqual(budgets, { preview: 1999, declaration: 19999, pixel: 99, update: 15, edit: 33, checked: 2999, built: 29999 });
});

test("the model's codes are the ones the shell, the fixtures and the words name", () => {
  assert.deepEqual(Object.keys(KIND), ["enter", "token", "frame", "declaration", "pixel", "update", "edit", "editScreen", "complete", "checked", "reload", "read", "refused", "reused", "rechecked"]);
  assert.deepEqual(Object.keys(KPI), ["preview", "declaration", "pixel", "update", "edit", "checked", "built", "reloads", "think", "lead", "write", "firstTry", "repaired", "refused", "reused", "rechecked"]);
  assert.deepEqual(Object.keys(LOOP), ["offer", "approve", "dismiss"]);
  assert.equal(model.theorems.length, 21);
});

test("the data form the tab runs is the one read from the checked source", () => {
  const source = JSON.parse(fs.readFileSync(new URL("../shell/telemetry/data/source.json", import.meta.url), "utf8"));
  for (const [path, sha] of Object.entries(source.files)) {
    const bytes = fs.readFileSync(new URL("../telemetry/" + path, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha, path + " changed since its data form was read; run studio/telemetry/tools/data-form.mjs");
  }
});

test("every KPI the owner tracks, as a function of events, to the microsecond", () => {
  const k = model.kpis(turn()), get = (n) => k[KPI[n]];
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
  assert.deepEqual(model.kpis([...turn()].reverse()), model.kpis(turn()));
});

test("a journey that did not happen is absent, not zero; an end before its start does not count", () => {
  const k = model.kpis([[KIND.enter, T0, 0, 0], [KIND.frame, T0 + 5, 0, 0]]);
  assert.equal(k[KPI.preview], 5);
  for (const n of ["declaration", "pixel", "update", "edit", "checked", "built"]) assert.equal(k[KPI[n]], null, n);
  assert.equal(model.kpis([[KIND.frame, T0, 0, 0]])[KPI.preview], null);
  assert.equal(model.kpis([[KIND.enter, T0 + 10, 0, 0], [KIND.frame, T0, 0, 0]])[KPI.preview], null);
  assert.equal(model.kpis([[KIND.enter, T0, 0, 0], [KIND.editScreen, T0 + 9, 0, 0]])[KPI.edit], null, "a paint with no edit before it times nothing");
});

test("a turn of any length: 20,000 events, no recursion, linear time", () => {
  const events = [[KIND.enter, T0, 0, 0]];
  for (let i = 0; i < 20_000; i++) events.push([KIND.update, T0 + i + 1, i % 97, 0]);
  const t0 = performance.now();
  assert.equal(model.kpis(events)[KPI.update], 96);
  assert.ok(performance.now() - t0 < 5000, "took " + (performance.now() - t0) + " ms");
  assert.ok(CAPACITY >= 16_384);
});

test("verdicts agree with the kernel's on every boundary: over exactly when it says over", async () => {
  for (const [name, budget] of Object.entries(budgets)) {
    for (const us of [0, 1, budget * 1000, budget * 1000 + 999, (budget + 1) * 1000 - 1, (budget + 1) * 1000, (budget + 1) * 1000 + 1, budget * 4000]) {
      const kernelSays = await ask(`budget ${name} ${Math.floor(us / 1000)}`);
      assert.equal(model.over(KPI[name], us, budget), kernelSays === "over", `${name} ${us} us`);
    }
  }
  assert.equal(model.over(KPI.reloads, 0, model.reloadBudget), false);
  assert.equal(model.over(KPI.reloads, 1, model.reloadBudget), true);
});

test("histogram buckets are a quarter to four times the threshold, and the third is the threshold", () => {
  for (const budget of Object.values(budgets)) {
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => model.bucketMicros(budget, i)), [250, 500, 1000, 2000, 4000].map((f) => (budget + 1) * f));
    assert.equal(model.bucketMicros(budget, 2), model.budgetMicros(budget));
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

test("a majority of turns must be over; one slow turn among fast ones is noise", () => {
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

test("observations: turns, turns over, worst, total and last, folded turn by turn", () => {
  assert.deepEqual(model.observe(KPI.pixel, [50_000, 120_000, 99_999, 100_000], 99), { kpi: KPI.pixel, turns: 4, over: 2, worst: 120_000, total: 369_999, last: 100_000 });
  assert.deepEqual(model.observe(KPI.think, [5, 7], 0), { kpi: KPI.think, turns: 2, over: 0, worst: 7, total: 12, last: 7 });
});

test("the model switch: never the current model, never on few samples, never within budget", () => {
  const built = { kpi: KPI.built, turns: 3, over: 3, worst: 0, total: 0, last: 0 };
  const a = { model: 0, reads: 6, firstTry: 2 }, b = { model: 1, reads: 6, firstTry: 6 };
  assert.equal(model.switchTo(a, [b], built), 1);
  assert.equal(model.switchTo(a, [{ ...b, reads: 4, firstTry: 4 }], built), null);
  assert.equal(model.switchTo(a, [{ ...b, model: 0 }], built), null);
  assert.equal(model.switchTo(a, [b], { ...built, over: 0 }), null);
  assert.equal(model.switchTo(b, [a], built), null, "a worse reader is never suggested");
  assert.equal(model.switchTo(a, [{ model: 2, reads: 9, firstTry: 8 }, b], built), 1, "the best first-try rate wins, in any order");
});

test("the loop is advisory: only approval adopts, and the loop judges before against after", async () => {
  const l0 = { applied: 0, pending: 0, baseline: 0 };
  const offered = model.loopStep(l0, LOOP.offer, LEVER.reasoning, 120);
  assert.deepEqual(offered, { applied: 0, pending: LEVER.reasoning, baseline: 120 });
  assert.deepEqual(model.loopStep(offered, LOOP.dismiss, 0, 0), { applied: 0, pending: 0, baseline: 120 });
  assert.deepEqual(model.loopStep(offered, LOOP.approve, 0, 0), { applied: LEVER.reasoning, pending: 0, baseline: 120 });
  assert.deepEqual(model.loopStep(l0, LOOP.approve, 0, 0), l0);
  assert.equal(model.assess(100, 90), 1);
  assert.equal(model.assess(100, 97), 0);
  assert.equal(model.assess(100, 110), 2);

  const t = make();
  for (const f of fixtureTurns(KIND)) await t.record(f);
  assert.equal((await t.adopt("declaration")).applied, LEVER.reasoning);
  assert.equal((await t.report()).kpis.find((k) => k.name === "declaration").assessment, null, "no turn since adoption yet");
  const later = fixtureTurns(KIND, Date.UTC(2026, 10, 12) * 1000)[0];
  later.events = later.events.map((e) => ([KIND.token, KIND.declaration, KIND.pixel, KIND.update].includes(e[0]) ? [e[0], e[1] - 70e6, e[2], e[3]] : e));
  await t.record(later);
  assert.equal((await t.report()).kpis.find((k) => k.name === "declaration").assessment, "improved");
  assert.equal((await t.dismiss("built")).applied, 0);
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
  await assert.rejects(t.exportTurns(), { code: "telemetry.flowRefused" });
  assert.match(await t.exportSnapshot({ userAct: true }), /prism_kpi_seconds/);
  assert.equal(JSON.parse(await t.exportTurns({ userAct: true })).turns.length, 1);
});

test("a kernel that refuses a flow stops it: nothing is stored", async () => {
  const backend = memoryBackend();
  const t = createTelemetry({ model, backend, ask: async (line) => (line.startsWith("telemetry store") ? "deny" : ask(line)) });
  await assert.rejects(t.record({ events: turn(), model: "m" }), { code: "telemetry.flowRefused" });
  assert.equal((await backend.all()).length, 0);
});

test("erase leaves nothing", async () => {
  const t = make();
  await t.record({ events: turn(), model: "m" });
  await t.erase();
  const r = await t.report();
  assert.equal(r.turns.length, 0);
  assert.equal(r.models.length, 0);
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
  for (const want of [
    'prism_kpi_seconds{kpi="preview"} 1.3', 'prism_kpi_seconds{kpi="update"} 0.0085', 'prism_kpi_threshold_seconds{kpi="update"} 0.016',
    'prism_kpi_duration_seconds_bucket{kpi="update",le="0.016"} 1', 'prism_kpi_duration_seconds_bucket{kpi="update",le="+Inf"} 1',
    'prism_kpi_over_budget_turns_total{kpi="declaration"} 1', 'prism_module_reads_total{model="model \\"a\\"\\\\x",attempt="first"} 1',
    "# TYPE prism_preview_reloads_total counter", 'prism_suggestion_info{kpi="declaration",lever="reasoning"} 1',
  ]) assert.ok(lines.includes(want), want);
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
    if (/_(total|bucket|count|sum)\{/.test(key) || key.endsWith("_total")) for (let i = 1; i < points.length; i++) assert.ok(points[i][1] >= points[i - 1][1], "never decreases: " + key);
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

test("zero egress at run time: recording, reporting, the loop, every export and erase touch no network API", async () => {
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
    await t.exportSnapshot({ userAct: true }); await t.exportHistory({ userAct: true }); await t.exportTurns({ userAct: true });
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
