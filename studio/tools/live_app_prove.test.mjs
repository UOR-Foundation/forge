// Run: node --test studio/tools/live_app_prove.test.mjs
// Proving a stateful app's module (shell/live/app.mjs with prism.js's proveFiles): what is sent to the
// verifier, how a wrong axiom set is corrected, and what the chat then says. The verifier is a
// stand-in that speaks its protocol; a real proof takes ten minutes or more and is run by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { card, checkLibrary, promisesOf, proofFiles, proofMessage, provingMessage, theoremsOf, withAxioms } from "../shell/live/app.mjs";
import { proveFiles } from "../shell/prism.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const module = read("../../v2/loop/answers/guests-3.verified.lex.tex");
const library = await checkLibrary((path) => Promise.resolve(read("../shell/live/v2/" + path)));

test("the theorems and the promises are read from the module, in order, word for word", () => {
  const theorems = theoremsOf(module), promises = promisesOf(module);
  assert.deepEqual(theorems.map((t) => t.name), ["startsEmpty", "clearEmpties", "emptyIgnored", "longIgnored", "staleIgnored"]);
  assert.deepEqual(theorems.map((t) => t.form), ["reflexivity", "reflexivity", "linear_arithmetic", "linear_arithmetic", "linear_arithmetic"]);
  for (const t of theorems) assert.ok(module.includes("statement: " + t.statement + ","), t.name);
  assert.equal(promises.length, theorems.length);
  assert.equal(promises[0], "The guest list starts empty.");
  assert.deepEqual(theoremsOf(module.replace(/theorem\{[\s\S]*$/, "\\end{semanticmodule}\n\\end{lexlean}\n")), []);
});

test("an axiom set Lean names is written into that theorem and nowhere else", () => {
  const fixed = withAxioms(module, { startsEmpty: "[propext]" });
  const before = theoremsOf(module), after = theoremsOf(fixed);
  assert.deepEqual(after.map((t) => t.statement), before.map((t) => t.statement));
  assert.match(fixed, /name: startsEmpty,[\s\S]*?axioms: \[propext\]/);
  const lines = (s) => s.split("\n"), changed = lines(fixed).filter((l, i) => l !== lines(module)[i]);
  assert.deepEqual(changed, ["  axioms: [propext]"]);
  assert.equal(withAxioms(module, { noSuchTheorem: "[propext]" }), module);
  assert.equal(withAxioms(fixed, { startsEmpty: "[propext]" }), fixed);
});

test("the proof is asked on the module and the library it imports, and must come back about the module", () => {
  const { files, entrypoints } = proofFiles(module, library);
  assert.deepEqual(files.map((f) => f.path).sort(), ["src/App.lex.tex", "src/Foundation/View/Browser/V1/Model.lex.tex"]);
  assert.deepEqual(entrypoints, ["src/App.lex.tex"]);
  const strip = (s) => s.replace(/\\title\{[^}]*\}/, "");
  assert.equal(strip(files.find((f) => f.path === "src/App.lex.tex").content), strip(module.trim() + "\n"), "the module's declarations go as written");
  assert.equal(strip(files.find((f) => f.path.endsWith("Model.lex.tex")).content), strip(read("../shell/live/v2/Model.lex.tex")), "the library's declarations go as shipped");
});

// The hosted verifier's protocol, as prism.js speaks it: a draft, a verify task, then polls.
function verifier(rounds) {
  const log = { drafts: [], polls: 0 };
  let round = 0;
  const answer = (result) => ({ status: 200, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result }) });
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body);
    if (request.method === "tools/call" && request.params.name === "lexlean_draft_write") { log.drafts.push(request.params.arguments.files); return answer({ structuredContent: { draft: "prism-app/round" + round } }); }
    if (request.method === "tools/call" && request.params.name === "lexlean_verify") return answer({ taskId: "t" + round, status: "working", pollIntervalMs: 1 });
    if (request.method === "tasks/get") { log.polls++; const r = rounds[round++]; return answer({ status: "completed", result: { structuredContent: { state: r.state }, content: [{ text: JSON.stringify(r.body) }] } }); }
    throw new Error("unexpected request " + request.method);
  };
  return { fetchImpl, log };
}
async function withFetch(fetchImpl, work) { const real = globalThis.fetch; globalThis.fetch = fetchImpl; try { return await work(); } finally { globalThis.fetch = real; } }
const filesFor = (seen) => async (axioms) => { seen.push({ ...axioms }); return proofFiles(withAxioms(module, axioms), library); };

test("a proof Lean verifies is reported with its attestation", { timeout: 20000 }, async () => {
  const { fetchImpl } = verifier([{ state: "verified", body: { attestation_id: "a".repeat(64), modules: ["App"], semantic_id: "s" } }]);
  const result = await withFetch(fetchImpl, () => proveFiles(filesFor([])));
  assert.equal(result.ok, true);
  assert.equal(result.record.attestation_id, "a".repeat(64));
  assert.deepEqual(result.record.entrypoints, ["src/App.lex.tex"]);
});

test("a wrong axiom set is corrected from what Lean observed, and the module proved again", { timeout: 20000 }, async () => {
  const seen = [];
  const { fetchImpl, log } = verifier([
    { state: "failed", body: { diagnostics: [{ code: "LLV7005", message: "`PrismTextRequest.App.emptyIgnored` violates its exact axiom policy: observed [Quot.sound, propext]" }] } },
    { state: "verified", body: { attestation_id: "b".repeat(64), modules: ["App"] } },
  ]);
  const result = await withFetch(fetchImpl, () => proveFiles(filesFor(seen)));
  assert.equal(result.ok, true);
  assert.deepEqual(seen, [{}, { emptyIgnored: "[Quot.sound, propext]" }]);
  assert.equal(log.drafts.length, 2);
  assert.match(log.drafts[1].find((f) => f.path === "src/App.lex.tex").content, /name: emptyIgnored,[\s\S]*?axioms: \[Quot\.sound, propext\]/);
});

test("a theorem Lean refuses is not proved, and a verifier that did not verify the module is not believed", { timeout: 20000 }, async () => {
  const refused = verifier([{ state: "failed", body: { diagnostics: [{ code: "LLV7001", message: "the proof of `clearEmpties` does not close" }] } }]);
  const a = await withFetch(refused.fetchImpl, () => proveFiles(filesFor([])));
  assert.deepEqual({ ok: a.ok, error: a.error }, { ok: false, error: "the proof of `clearEmpties` does not close" });
  const other = verifier([{ state: "verified", body: { attestation_id: "c".repeat(64), modules: ["Foundation.View.Browser.V1.Model"] } }]);
  const b = await withFetch(other.fetchImpl, () => proveFiles(filesFor([])));
  assert.equal(b.ok, false);
  assert.match(b.error, /did not verify App/);
  const silent = verifier([{ state: "verified", body: { modules: ["App"] } }]);
  assert.equal((await withFetch(silent.fetchImpl, () => proveFiles(filesFor([])))).ok, false, "no attestation, no proof");
});

test("what the chat says: each promise beside the exact statement proved, and never more than happened", () => {
  const theorems = theoremsOf(module), promises = promisesOf(module);
  const proved = proofMessage({ ok: true, seconds: 742, record: { attestation_id: "d".repeat(64) }, theorems, promises });
  assert.match(proved, /^\*\*Proved by Lean\.\*\* 5 theorems/);
  for (let i = 0; i < theorems.length; i++) assert.ok(proved.includes("- " + promises[i] + "\n  Lean proved: `" + theorems[i].statement + "`"), theorems[i].name);
  assert.match(proved, /A sentence can say more than its theorem/);
  assert.match(proved, /cannot be published yet/);
  const refused = proofMessage({ ok: false, error: "the proof of `clearEmpties` does not close", diagnostics: [{ code: "LLV7001" }], theorems: [], promises: [] });
  assert.match(refused, /Lean refused it/);
  // The verifier failing is not the app failing, and is not blamed on a property.
  const broken = proofMessage({ ok: false, error: "staging process: No space left on device (os error 28)", diagnostics: [{ code: "LLB6003" }], theorems: [], promises: [] });
  assert.match(broken, /The verifier could not run the proof/);
  assert.match(broken, /says nothing about the app/);
  assert.ok(!/fix the property/.test(broken));
  assert.match(proofMessage({ ok: false, error: "the proof did not end in 15 minutes", theorems: [], promises: [] }), /verifier could not run/);
  assert.match(refused, /^\*\*Not proved\.\*\*/);
  assert.match(refused, /back to checked/);
  assert.ok(!/Proved by Lean/.test(refused));
  assert.match(provingMessage(5), /5 properties/);
  assert.match(provingMessage(1), /1 property /);
  assert.match(card({ phase: "proving" }), /Lean is proving/);
  assert.match(card({ phase: "proved", theorems, proof: { attestation_id: "d".repeat(64) } }), /proved by Lean[\s\S]*5 theorems[\s\S]*cannot be published yet/);
  for (const phase of ["drafting", "checked", "proving"]) assert.ok(!/proved by Lean/i.test(card({ phase, issues: [] })), phase);
});
