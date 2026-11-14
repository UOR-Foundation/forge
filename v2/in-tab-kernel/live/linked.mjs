// Proves an app through live/Linked.lean: every evaluation a fact kept by its address, every guarantee assembled
// from facts. Then proves it again, then after edits, and plants faults. WebAssembly kernel under Node; one kernel
// for the whole run, as a tab has.
//   node live/linked.mjs <built dist dir> <library.ndjson> <VerdantRegions.lean>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readLibrary, extendLibrary, linkFacts, linkedProof } from "./emit.mjs";
import { linksOf, linkKey } from "./certs.mjs";
import { appOf } from "./read-app.mjs";

const [dist, libraryPath, verdantPath] = process.argv.slice(2);
const factory = (await import(pathToFileURL(path.resolve(dist, "lean-kernel.mjs")).href)).default;
const wasmBinary = fs.readFileSync(path.resolve(dist, "lean-kernel.wasm"));
const libraryBytes = fs.readFileSync(libraryPath);
const lines = [];
const m = await factory({ instantiateWasm: (imports, done) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => done(r.instance, r.module)); return {}; }, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("not ready");
const call = (entry, text) => { lines.length = 0; m.FS.writeFile("/in.ndjson", text); const t = performance.now(); let exit; try { exit = m.ccall(entry, "number", ["string"], ["/in.ndjson"]); } catch (e) { exit = 3; lines.push("trap: " + e.message); } const ms = performance.now() - t; m.FS.unlink("/in.ndjson"); return { exit, ms, said: lines[lines.length - 1] }; };
const MB = () => Math.round(m.HEAPU8.length / 1048576);
const round = (x) => Math.round(x * 10) / 10;

if (call("load_library", libraryBytes).exit !== 0) throw new Error("the library was not admitted");
const library = readLibrary(libraryBytes.toString("utf8"));
const resident = new Set();   // the addresses of the facts the kernel holds

// Has the kernel judge the facts not yet resident, in one suffix, and keeps them. False if it refuses.
function keep(facts, r) {
  const fresh = facts.filter((f) => !resident.has(f.key));
  r.factsReused += facts.length - fresh.length;
  if (!fresh.length) return true;
  let t = performance.now(); const text = linkFacts(library, fresh); r.writeMs += performance.now() - t;
  const v = call("check_keep", text); r.factMs += v.ms;
  if (v.exit !== 0) return false;
  t = performance.now(); extendLibrary(library, text); r.writeMs += performance.now() - t;
  for (const f of fresh) resident.add(f.key);
  r.factsNew += fresh.length;
  for (const f of fresh) r.newByKind[f.kind] = (r.newByKind[f.kind] ?? 0) + 1;
  return true;
}

// One pass over an app. The facts that hold whatever the guarantees say go first, in one suffix; then, guarantee by
// guarantee, the coverings it needs, and its assembly.
function prove(app, given) {
  let t = performance.now(); const links = given ?? linksOf(app);
  const r = { guarantees: app.properties.length, facts: links.facts.size, factsNew: 0, factsReused: 0, newByKind: {}, factMs: 0, glueMs: 0, glueMsEach: [], glueBytes: 0, accepted: 0, refused: [], writeMs: performance.now() - t };
  const all = [...links.facts.values()];
  if (!keep(all.filter((f) => f.kind !== "covers"), r)) { r.refused = app.properties.map((_, i) => i); r.why = "a fact that is not a covering was refused"; return r; }
  links.guarantees.forEach((g, i) => {
    const covers = g.steps.filter((s) => s.how === "cover").map((s) => links.facts.get(s.covers));
    if (!keep(covers, r)) { r.refused.push(i); r.glueMsEach.push(null); return; }
    let text;
    t = performance.now(); try { text = linkedProof(library, app, i, links); } catch (e) { r.refused.push(i); r.glueMsEach.push(null); r.why = e.message; return; } r.writeMs += performance.now() - t;
    const v = call("check_suffix", text); r.glueMs += v.ms; r.glueMsEach.push(round(v.ms)); r.glueBytes += text.length;
    if (v.exit === 0) r.accepted++; else { r.refused.push(i); r.said = v.said; }
  });
  r.totalMs = round(r.factMs + r.glueMs + r.writeMs); r.factMs = round(r.factMs); r.glueMs = round(r.glueMs); r.writeMs = round(r.writeMs); r.heapMB = MB();
  return r;
}

const verdant = appOf(fs.readFileSync(verdantPath, "utf8"), "VerdantLinked");
const report = { rules: verdant.rules.length, first: prove(verdant), again: prove(verdant) };

// Edits: one number in one rule moved by one, from the last rule back. An edit that breaks a guarantee must be
// refused, and is counted.
report.edits = [];
let tried = 0, breaking = 0;
for (let ri = verdant.rules.length - 1; ri >= 0 && report.edits.length < 5; ri--) {
  const rule = verdant.rules[ri];
  if (!rule.when.length) continue;
  const when = rule.when.map((c, k) => (k === 0 ? [c[0], c[1], c[2] + 1] : c));
  const edited = { ...verdant, rules: verdant.rules.map((x, k) => (k === ri ? { ...x, when } : x)) };
  tried++;
  const r = prove(edited);
  if (r.refused.length) { breaking++; continue; }
  report.edits.push({ rule: ri, from: rule.when[0], to: when[0], ...r });
}
report.editsTried = tried; report.editsThatBreakAGuarantee = breaking;
// The app as it was, after the edits: everything it needs is still resident.
report.backToTheFirst = prove(verdant);

// Faults. None may be accepted.
const faults = {}, links = linksOf(verdant);
const gi = links.guarantees.findIndex((g) => g.steps.some((s) => s.how === "cover" && s.sel.length)), g = links.guarantees[gi];
const si = g.steps.findIndex((s) => s.how === "cover" && s.sel.length), step = g.steps[si];
const scratch = () => ({ factsNew: 0, factsReused: 0, newByKind: {}, factMs: 0, writeMs: 0 });
{ // A covering that is false: the last box that covers the region is left out.
  const f = links.facts.get(step.covers), Bs = f.Bs.slice(0, -1), lie = { key: linkKey("covers", f.M, Bs), kind: "covers", M: f.M, Bs };
  faults.aCoveringThatIsFalse = { kept: keep([lie], scratch()), said: lines[lines.length - 1] };
}
{ // A proof that leaves out a rule it needs: the covering it then names is the false one above.
  const sel = step.sel.slice(0, -1), Bs = sel.map((q) => links.boxes[q]), key = linkKey("covers", step.M, Bs);
  const short = { ...links, facts: new Map(links.facts).set(key, { key, kind: "covers", M: step.M, Bs }), guarantees: links.guarantees.map((x, k) => (k !== gi ? x : { ...x, steps: x.steps.map((s, j) => (j === si ? { ...s, sel, covers: key } : s)) })) };
  const r = prove({ ...verdant, name: "FaultShort" }, short);
  faults.aRuleLeftOut = { refused: r.refused, accepted: r.accepted };
}
{ // A rule that breaks the guarantee, said not to: the fact that it does not is false.
  const p = verdant.properties[gi], o = si < verdant.rules.length ? verdant.rules[si].outcome : verdant.otherwise;
  const lie = { key: linkKey("notbad", p.always, p.outcome, o), kind: "notbad", always: p.always, outcome: p.outcome, o };
  faults.aBreakingAnswerSaidHarmless = { kept: keep([lie], scratch()), said: lines[lines.length - 1] };
  // And answered instead by a true fact about another answer: the assembly does not fit.
  const other = [...links.facts.values()].find((f) => f.kind === "notbad" && f.always === p.always && f.outcome === p.outcome);
  if (other) {
    const wrong = { ...links, guarantees: links.guarantees.map((x, k) => (k !== gi ? x : { ...x, steps: x.steps.map((s, j) => (j === si ? { how: "ok", fact: other.key } : s)) })) };
    const v = call("check_suffix", linkedProof(library, { ...verdant, name: "FaultOther" }, gi, wrong));
    faults.aStepAnsweredByAnotherStepsFact = { exit: v.exit, said: v.said };
  }
}
{ // A fact the kernel never judged: there is nothing to name.
  const ghost = { ...links, guarantees: links.guarantees.map((x, k) => (k !== gi ? x : { ...x, prop: "0".repeat(64) })) };
  try { linkedProof(library, { ...verdant, name: "FaultGhost" }, gi, ghost); faults.aFactNeverJudged = "written"; } catch (e) { faults.aFactNeverJudged = e.message.slice(0, 40); }
}
{ // A guarantee the rules break, with honest facts: a covering it needs cannot be proved.
  const broken = { ...verdant, name: "FaultBroken", properties: verdant.properties.map((p, k) => (k === 0 ? { ...p, always: !p.always } : p)) };
  const r = prove(broken);
  faults.aGuaranteeTheRulesBreak = { refused: r.refused, accepted: r.accepted, of: r.guarantees };
}
report.faults = faults;
report.residentFacts = resident.size; report.heapMB = MB();
console.log(JSON.stringify(report, null, 1));
