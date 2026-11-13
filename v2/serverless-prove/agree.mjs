// The tab against the authority. For each case: the SDK image's verdict on the spec (lexlean verify, recorded in
// evidence/authority/), and the tab's, through both of its layers:
//   key layer      the tab computes the theorem's key from the spec and admits only a record filed under that key
//                  whose bundle bytes hash to the address the record names;
//   binding layer  the bundle is bound to the spec's own statement, equations and types, and the kernel checks it.
// Spec faults are offered the honest bundle of the original spec. Bundle faults are offered under a record a
// dishonest store wrote for the right key, so the binding layer meets them alone.
//   node agree.mjs            writes evidence/agreement.json
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { load, check } from "../in-tab-prove/kernel.mjs";
import { assemble, decide, diagnose, VERDICT } from "./bind.mjs";
import { keyOf, sha256, toolchainPreimage, admit } from "./records.mjs";
import { bundleFaults } from "./faults.mjs";
import { agreementJSON } from "./evidence-format.mjs";

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const read = (p) => readFileSync(join(here, p));
const permitted = ["propext", "Quot.sound", "Classical.choice"];
const library = read("dist/library.ndjson"), wasm = read("dist/kernel-tab.wasm");
const bundles = { guests: read("dist/guests.whole.ndjson"), payment: read("dist/payment.whole.ndjson") };
const checker = await load(wasm);
// Lean's own kernel on each assembled input, when lean-kernel.sh has run: { <sha256 hex>: { accepted, output, ms } }.
const leanFile = join(here, "evidence", "lean-kernel.json");
const leanResults = existsSync(leanFile) ? JSON.parse(readFileSync(leanFile)) : {};
const toolchain = await sha256(toolchainPreimage({ lean: "4.32.1 f054605aea4b840552cca2e725580bffd1e1b704", library: await sha256(library), checker: await sha256(wasm), emitter: "prism/serverless-prove/emit/1" }));

function specOf(dir) {
  const src = JSON.parse(read(join("corpus", dir, "data", "source.json")));
  return { prefix: JSON.parse(read(join("corpus", dir, "spec.json"))).module_prefix, draft: src.draft,
    modules: Object.fromEntries(src.modules.map((m) => [m, JSON.parse(read(join("corpus", dir, "data", m + ".json")))])) };
}
function theoremsOf(spec) {
  return Object.entries(spec.modules).flatMap(([m, d]) => d.declarations.filter((x) => x.kind === "theorem").map((x) => `${spec.prefix}.${m}.${x.name}`));
}

// The honest store: one record per theorem of the two verified specs, filed under the key the tab computes.
const store = new Map(), blobs = new Map();
for (const [name, dir] of [["guests", "guests"], ["payment", "payment"]]) {
  const spec = specOf(dir), address = await sha256(bundles[name]);
  blobs.set(address, bundles[name]);
  for (const t of theoremsOf(spec)) store.set(await keyOf(spec, t, toolchain), { key: await keyOf(spec, t, toolchain), theorem: t, bundle: address });
}

function bindingVerdict(spec, theorem, bundle) {
  const t0 = performance.now();
  const a = assemble({ library, bundle, spec, theorems: [theorem] });
  if (!a.ok) return { verdict: VERDICT.refused, why: `${a.code}: ${a.why}`, ms: performance.now() - t0 };
  const inTabOnly = a.theoremRows[0]?.madeInTab;
  const assembled = new Uint8Array(Buffer.concat([bundle, Buffer.from(a.appended)]));
  const r = check(checker, assembled, { admitted: a.admitted, permitted_axioms: permitted });
  // The same bytes go to Lean's own kernel (official/, run by lean-kernel.sh): one input, two judgements.
  const address = createHash("sha256").update(assembled).digest("hex");
  const file = join(here, "dist", "assembled", address + ".ndjson");
  if (!existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, assembled); }
  const lean = leanResults[address];
  const row = decide(a, r, permitted)[0];
  const ms = Math.round(performance.now() - t0);
  const failing = !r.ok && r.stage !== "input" ? diagnose(a, bundle, (bytes) => check(checker, bytes, { admitted: a.admitted, permitted_axioms: permitted })) : undefined;
  // "proved" needs Lean's own kernel to have accepted these very bytes, on top of everything kernel-checked needs.
  const verdict = row.verdict === VERDICT.kernelChecked && lean?.accepted ? VERDICT.proved : row.verdict;
  return { verdict, nanoda: r.ok ? "accepted" : "refused", lean: lean ? (lean.accepted ? "accepted" : `refused: ${lean.output.trim().split("\n")[0].slice(0, 120)}`) : "not run",
    leanMs: lean?.ms, assembled: address, why: failing ? `${row.why?.split("\n")[0]}; refused: ${failing.join(", ")}` : row.why, axioms: row.axioms, madeInTab: !!inTabOnly, ms };
}

async function tab(spec, theorem, { record, bytes, skipKeys = false } = {}) {
  const key = await keyOf(spec, theorem, toolchain);
  const madeInTab = spec.modules[theorem.split(".")[1]]?.declarations.find((d) => `${spec.prefix}.${theorem.split(".")[1]}.${d.name}` === theorem)?.proof.kind === "reflexivity";
  let keyLayer = "not needed: made in the tab", bundle = bundles.payment; // a bundle is still needed for definitions
  if (!madeInTab || record || bytes) {
    const rec = record ?? store.get(key);
    const got = bytes ?? (rec && blobs.get(rec.bundle));
    const refusal = await admit({ key, theorem }, rec, got);
    keyLayer = refusal ?? "admitted";
    if (refusal && !skipKeys) return { keyLayer, verdict: refusal === "SP_NO_RECORD" ? VERDICT.pending : VERDICT.refused, why: refusal };
    bundle = got ?? (rec && blobs.get(rec.bundle));
  }
  if (madeInTab && !record && !bytes) bundle = theorem.includes(".App.") ? bundles.guests : bundles.payment;
  return { keyLayer, ...bindingVerdict(spec, theorem, bundle) };
}

const authority = (f) => JSON.parse(read(join("evidence", "authority", f)));
const authOf = (name, theorem) => {
  const a = authority(`${name}.authority.json`), d = a.declarations.find((x) => x.name === theorem);
  return { verdict: a.status, axioms: d.observed };
};
const failed = (f) => { const v = authority(f); return { verdict: "refused", code: v.diagnostics[0].code }; };

const rows = [];
const push = async (kase, spec, theorem, image, opts) => {
  const t = await tab(spec, theorem, opts);
  const bindingOnly = opts?.alsoBinding ? bindingVerdict(spec, theorem, bundles[opts.alsoBinding]) : undefined;
  rows.push({ case: kase, theorem, image, tab: t, bindingOnly });
  console.log(kase.padEnd(44), theorem.split(".").pop().padEnd(18), String(image.verdict).padEnd(9), image.code ?? JSON.stringify(image.axioms ?? ""), "|", t.verdict, t.keyLayer, `lean:${t.lean ?? "-"}`.slice(0, 60), t.why ?? JSON.stringify(t.axioms), bindingOnly ? `| binding alone: ${bindingOnly.verdict} nanoda:${bindingOnly.nanoda} lean:${bindingOnly.lean} ${bindingOnly.why ?? ""}`.slice(0, 200) : "");
};

for (const [name, dir] of [["guests", "guests"], ["payment", "payment"]]) {
  const spec = specOf(dir);
  for (const t of theoremsOf(spec)) await push(`${name}: as verified`, spec, t, authOf(name, t));
}
const specFaults = [
  ["spec: false statement (+ 2)", "fault-false-statement", "PrismTextRequest.Payment.clearAdvances", "payment"],
  ["spec: false statement by reflexivity", "fault-false-reflexivity", "PrismTextRequest.App.startsEmpty", "guests"],
  ["spec: axioms declared []", "fault-wrong-axioms", "PrismTextRequest.Payment.clearAdvances", "payment"],
  ["spec: broken proof (wrong definition unfolded)", "fault-broken-proof", "PrismTextRequest.Payment.clearAdvances", "payment"],
];
for (const [kase, dir, t, b] of specFaults) await push(kase, specOf(dir), t, failed(`${dir}.verify.json`), { alsoBinding: b });

const payment = specOf("payment"), guests = specOf("guests");
const P = "PrismTextRequest.Payment.clearAdvances", G = "PrismTextRequest.App.emptyIgnored";
const keyP = await keyOf(payment, P, toolchain), keyG = await keyOf(guests, G, toolchain);
for (const [kase, make, spec, theorem, key] of [
  ["bundle: statement swapped under the same name", bundleFaults["statement swapped under the same name"], payment, P, keyP],
  ["bundle: broken proof", bundleFaults["broken proof"], payment, P, keyP],
  ["bundle: proof by an undeclared axiom (sorryAx)", bundleFaults["proof by an undeclared axiom"], payment, P, keyP],
  ["bundle: definition altered (breaksEmpty := false)", bundleFaults["definition altered"], guests, G, keyG],
  ["bundle: library name declared again", bundleFaults["library name declared again"], guests, G, keyG],
  ["bundle: library bytes altered", bundleFaults["library bytes altered"], guests, G, keyG],
]) {
  const bytes = make(new Uint8Array(kase.includes("payment") || spec === payment ? bundles.payment : bundles.guests));
  // A dishonest store: a record for the right key naming the faulty bytes' own address.
  await push(kase, spec, theorem, { verdict: "verified", note: "the image verified the honest spec" }, { record: { key, theorem, bundle: await sha256(bytes) }, bytes });
}
// Faults in the record itself.
const honest = store.get(keyP);
await push("record: right record, other bytes delivered", payment, P, { verdict: "verified" }, { record: honest, bytes: bundleFaults["broken proof"](new Uint8Array(bundles.payment)) });
await push("record: filed under another theorem's key", payment, P, { verdict: "verified" }, { record: { ...store.get(await keyOf(payment, "PrismTextRequest.Payment.viewKeepsRevision", toolchain)) } });
const otherToolchain = await sha256(toolchainPreimage({ lean: "4.33.1", library: "x", checker: "y", emitter: "prism/serverless-prove/emit/1" }));
await push("record: filed for another toolchain", payment, P, { verdict: "verified" }, { record: { ...honest, key: await keyOf(payment, P, otherToolchain) } });
await push("record: another project's bundle under the right key", payment, P, { verdict: "verified" }, { record: { key: keyP, theorem: P, bundle: await sha256(bundles.guests) }, bytes: bundles.guests });

writeFileSync(join(here, "evidence", "agreement.json"), agreementJSON({ toolchain, checker: await sha256(wasm), library: await sha256(library), rows }));
