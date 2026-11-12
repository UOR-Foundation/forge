// Binds the Telemetry LexLean model (data/*.json, the toolchain's data form of the checked source) to
// JavaScript values. Every decision is the model's: KPI values, verdicts, observations, suggestions,
// the model switch, the loop, what may flow where, retention and histogram buckets. This file converts
// numbers and lists, sorts a turn's events by time, and decides nothing.
import { loadProject, NIL, cons, toArray } from "../shell/interp.mjs";

const list = (items) => items.reduceRight((tail, head) => cons(head, tail), NIL);
const big = (n) => BigInt(Math.round(n));
const num = (b) => Number(b);
const opt = (o) => (o.c === "Option.some" ? num(o.a[0]) : null);

// `modules` maps a module name to its data form, as data/*.json hold it.
export function fromData(modules) {
  const project = loadProject(modules);
  if (project.missingPrimitives.length) throw new Error("interpreter lacks " + project.missingPrimitives.join(", "));
  return bind(project, modules.Telemetry);
}

export async function loadModelNode() {
  const { readFile } = await import("node:fs/promises");
  const dir = new URL("./data/", import.meta.url), read = async (n) => JSON.parse(await readFile(new URL(n, dir), "utf8"));
  const modules = {};
  for (const name of await read("modules.json")) modules[name] = await read(name + ".json");
  return fromData(modules);
}

function bind(project, data) {
  const call = (name, ...args) => project.call("Telemetry::" + name, ...args);
  const constant = (name) => num(call(name));
  // The model's named codes: its definitions without parameters.
  const names = data.declarations.filter((d) => d.kind === "definition" && d.parameters.length === 0).map((d) => d.name);
  const table = (prefix) => Object.fromEntries(names.filter((n) => n.startsWith(prefix) && /^[A-Z]/.test(n.slice(prefix.length))).map((n) => [n.slice(prefix.length, prefix.length + 1).toLowerCase() + n.slice(prefix.length + 1), constant(n)]));
  const KIND = table("kind"), KPI = table("kpi"), LEVER = table("lever"), EFFECT = table("effect"), LOOP = table("loop");
  delete KPI.count;
  const event = ([kind, at, value, model]) => ({ kind: big(kind), at: big(at), value: big(value), model: big(model) });
  // The model reads "first" as first in the list; events from several contexts arrive out of order, so
  // the list is put in time order here (a stable sort keeps marks with the same microsecond in order).
  const eventList = (events) => list([...events].sort((a, b) => a[1] - b[1]).map(event));
  const observation = (o) => ({ kpi: num(o.kpi), turns: num(o.turns), over: num(o.over), worst: num(o.worst), total: num(o.total), last: num(o.last) });
  const toObservation = (o) => ({ kpi: big(o.kpi), turns: big(o.turns), over: big(o.over), worst: big(o.worst), total: big(o.total), last: big(o.last) });
  const stages = (s) => ({ think: big(s.think), lead: big(s.lead), write: big(s.write), check: big(s.check) });
  const stat = (s) => ({ model: big(s.model), reads: big(s.reads), firstTry: big(s.firstTry) });
  const loop = (l) => ({ applied: big(l.applied), pending: big(l.pending), baseline: big(l.baseline) });
  return {
    KIND, KPI, LEVER, EFFECT, LOOP,
    keepLimit: constant("keepLimit"), reloadBudget: constant("reloadBudget"), kpiCount: constant("kpiCount"),
    // One turn's KPIs: { code: microseconds or count, or null when the turn has no such journey }.
    kpis(events) {
      const l = eventList(events), out = {};
      for (let code = 0; code < constant("kpiCount"); code++) out[code] = opt(call("kpiOf", l, BigInt(code)));
      return out;
    },
    budgeted: (code) => call("budgeted", BigInt(code)),
    over: (code, value, budget) => num(call("overCode", BigInt(code), big(value), BigInt(budget))) === 1,
    budgetMicros: (budget) => num(call("budgetMicros", BigInt(budget))),
    observe: (code, values, budget) => observation(call("observe", BigInt(code), list(values.map(big)), BigInt(budget))),
    persistent: (o) => call("persistent", toObservation(o)),
    lever: (o, s) => num(call("lever", toObservation(o), stages(s))),
    severity: (o) => num(call("severity", toObservation(o))),
    firstTryPermille: (s) => num(call("firstTryPermille", stat(s))),
    switchTo: (current, others, built) => { const pick = num(call("bestSwitch", stat(current), list(others.map(stat)), toObservation(built), 0n, call("firstTryPermille", stat(current)))); return pick === 0 ? null : pick - 1; },
    loopStep: (l, event, offered, mean) => { const r = call("loopStep", loop(l), BigInt(event), BigInt(offered), big(mean)); return { applied: num(r.applied), pending: num(r.pending), baseline: num(r.baseline) }; },
    assess: (before, after) => num(call("assess", big(before), big(after))),
    flowAllows: (effect, userAct, onDevice) => num(call("flowAllows", BigInt(effect), userAct ? 1n : 0n, onDevice ? 1n : 0n)) === 1,
    kept: (count) => num(call("kept", BigInt(count))),
    evicted: (count) => num(call("evicted", BigInt(count))),
    bucketMicros: (budget, index) => num(call("bucketMicros", BigInt(budget), BigInt(index))),
    theorems: project.theorems,
  };
}

export { toArray };
