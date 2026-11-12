// The gate for v2/serverless-prove. A needed artefact that is absent fails a test; nothing is skipped.
//   node --test v2/serverless-prove/test.mjs
// dist/ is made by make-dist.mjs from the exports the predecessor captured (see REPORT.md, "Reproduce").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { Session, admit, VERDICT } from "./tab.mjs";
import { bundleFaults } from "./faults.mjs";
import { obligations } from "./emit.mjs";
import { sha256 } from "./records.mjs";

const at = (p) => new URL(p, import.meta.url);
const need = (p) => { assert.ok(existsSync(at(p)), `needed artefact absent: ${p}`); return readFileSync(at(p)); };
const json = (p) => JSON.parse(need(p));
const spec = (name, app) => {
  const src = json(`./corpus/${name}/data/source.json`);
  const modules = Object.fromEntries(src.modules.map((m) => [m, json(`./corpus/${name}/data/${m}.json`)]));
  if (app) modules.App = app;
  return { prefix: "PrismTextRequest", modules };
};

let session, records;
async function open() {
  if (session) return session;
  const manifest = json("./dist/manifest.json");
  records = json("./dist/records.json");
  session = await Session.open({ manifest, wasm: need("./dist/kernel-tab.wasm"), library: need("./dist/library.ndjson") });
  for (const name of ["guests", "payment"]) {
    const r = records.find((x) => x.suffix === `${name}.suffix.ndjson`);
    const a = await session.admitSuffix(r, need(`./dist/${r.suffix}`));
    assert.equal(a.refusal, null);
  }
  return session;
}
const verdictsOf = (s, sp, theorems, bundle) => s.judge(sp, theorems, bundle).rows.map((r) => r.verdict);

test("the checker and the library are refused unless they are the manifest's bytes", async () => {
  const manifest = json("./dist/manifest.json");
  const library = need("./dist/library.ndjson"), wasm = need("./dist/kernel-tab.wasm");
  const altered = Uint8Array.from(library); altered[100] ^= 1;
  await assert.rejects(Session.open({ manifest, wasm, library: altered }), /SP_LIBRARY/);
  const w = Uint8Array.from(wasm); w[w.length - 1] ^= 1;
  await assert.rejects(Session.open({ manifest, wasm: w, library }), /ITP_ADDRESS/);
});

test("every theorem of guests and payment is kernel-checked, bound to the spec's own statement", async () => {
  const s = await open();
  for (const name of ["guests", "payment"]) {
    const mine = records.filter((r) => r.suffix === `${name}.suffix.ndjson`);
    assert.deepEqual(verdictsOf(s, spec(name), mine.map((r) => r.theorem), mine[0].bundle), mine.map(() => VERDICT.kernelChecked));
  }
});

test("an edited reflexivity theorem is decided in the tab: a true one kernel-checked, a false one refused", async () => {
  const s = await open();
  const r = records.find((x) => x.theorem.endsWith("startsEmpty"));
  assert.deepEqual(verdictsOf(s, spec("guests", json("./dist/guests.App.edit-true.json")), [r.theorem], r.bundle), [VERDICT.kernelChecked]);
  assert.deepEqual(verdictsOf(s, spec("guests", json("./dist/guests.App.edit-false.json")), [r.theorem], r.bundle), [VERDICT.refused]);
});

test("the spec's faults are refused when bound to the original proofs", async () => {
  const s = await open();
  const p = records.find((x) => x.theorem.endsWith("clearAdvances"));
  for (const dir of ["fault-false-statement", "fault-wrong-axioms"]) assert.deepEqual(verdictsOf(s, spec(dir), [p.theorem], p.bundle), [VERDICT.refused], dir);
  const g = records.find((x) => x.theorem.endsWith("startsEmpty"));
  assert.deepEqual(verdictsOf(s, spec("fault-false-reflexivity"), [g.theorem], g.bundle), [VERDICT.refused]);
});

test("every planted bundle fault is refused", async () => {
  const s = await open();
  const library = need("./dist/library.ndjson");
  const whole = (name) => { const sx = need(`./dist/${name}.suffix.ndjson`); const b = new Uint8Array(library.length + sx.length); b.set(library); b.set(sx, library.length); return b; };
  const cases = [
    ["statement swapped under the same name", "payment", "PrismTextRequest.Payment.clearAdvances"],
    ["broken proof", "payment", "PrismTextRequest.Payment.clearAdvances"],
    ["proof by an undeclared axiom", "payment", "PrismTextRequest.Payment.clearAdvances"],
    ["definition altered", "guests", "PrismTextRequest.App.emptyIgnored"],
    ["library name declared again", "guests", "PrismTextRequest.App.emptyIgnored"],
    ["library bytes altered", "guests", "PrismTextRequest.App.emptyIgnored"],
  ];
  for (const [fault, project, theorem] of cases) {
    const bytes = bundleFaults[fault](whole(project));
    // A dishonest store files the faulty bytes under the right key with their own address.
    const record = { theorem, bundle: await sha256(bytes.subarray(library.length)) };
    const a = await s.admitSuffix(record, bytes.subarray(library.length));
    const v = a.refusal ? VERDICT.refused : (bytes.subarray(0, library.length).every((x, i) => x === library[i]) ? verdictsOf(s, spec(project), [theorem], record.bundle)[0] : VERDICT.refused);
    s.bundles.delete(record.bundle);
    assert.equal(v, VERDICT.refused, fault);
  }
});

test("a record is admitted only under the key the tab computed, for the theorem asked, with bytes of its address", async () => {
  const s = await open();
  const p = records.find((x) => x.theorem.endsWith("clearAdvances")), other = records.find((x) => x.theorem.endsWith("viewKeepsRevision"));
  const bytes = need(`./dist/${p.suffix}`);
  const key = await s.key(spec("payment"), p.theorem);
  assert.equal(key, p.key);
  assert.equal(await admit({ key, theorem: p.theorem }, p, bytes), null);
  assert.equal(await admit({ key, theorem: p.theorem }, other, bytes), "SP_KEY");
  assert.equal(await admit({ key, theorem: p.theorem }, { ...p, theorem: other.theorem }, bytes), "SP_THEOREM");
  const altered = Uint8Array.from(bytes); altered[10] ^= 1;
  assert.equal(await admit({ key, theorem: p.theorem }, p, altered), "SP_BUNDLE_ADDRESS");
  assert.equal(await admit({ key, theorem: p.theorem }, undefined, bytes), "SP_NO_RECORD");
  // Editing the theorem's statement changes its key, so no existing record applies.
  assert.notEqual(await s.key(spec("fault-false-statement"), p.theorem), key);
});

test("the emitter refuses what it cannot state, by name, and the theorem is not accepted", () => {
  const sp = spec("payment");
  const app = structuredClone(sp.modules.Payment);
  const t = app.declarations.find((d) => d.name === "clearAdvances");
  t.statement = { kind: "eq", left: { kind: "primitive", operation: "utf8_decode", arguments: [{ kind: "string", value: "x" }], result: { kind: "string" } }, right: { kind: "string", value: "x" } };
  const ob = obligations({ ...sp, modules: { ...sp.modules, Payment: app } }, ["PrismTextRequest.Payment.clearAdvances"]);
  assert.equal(ob.theorems.length, 0);
  assert.match(ob.refused[0].reason, /primitive utf8_decode/);
});

test("the agreement record: the tab accepts exactly what the image verified, and Lean's own kernel agrees with the tab's on every input", () => {
  const a = json("./evidence/agreement.json");
  assert.ok(a.rows.length >= 21);
  for (const r of a.rows) {
    const accepted = [VERDICT.proved, VERDICT.kernelChecked].includes(r.tab.verdict);
    assert.equal(accepted, r.case.endsWith("as verified") && r.image.verdict === "verified", r.case);
    if (accepted) assert.deepEqual(r.tab.axioms, [...r.image.axioms].sort(), r.case);
    if (r.tab.nanoda && r.tab.lean !== "not run") assert.equal(r.tab.nanoda === "accepted", r.tab.lean === "accepted", `${r.case}: the two kernels differ`);
  }
});

test("the spec of the design is proved: lexlean verify in the pinned image, attestation verified, 23 theorems", () => {
  const v = json("./spec/evidence/verify.json"), a = json("./spec/evidence/attestation.json");
  assert.equal(v.success, true);
  assert.equal(a.status, "verified");
  const mine = a.declarations.filter((d) => d.name.startsWith("ServerlessProve.") && d.policy.kind !== "none");
  assert.equal(mine.length, 23);
  for (const d of mine) assert.equal(d.result, "ok", d.name);
});
