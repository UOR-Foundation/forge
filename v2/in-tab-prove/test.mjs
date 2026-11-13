// node --test v2/in-tab-prove/test.mjs
// Holds the in-tab kernel check to the authority (`lexlean verify` in the pinned SDK image, recorded in evidence/)
// on two real specs and on planted faults. Needs dist/ (build.sh, capture-staging.sh, make-exports.sh,
// kernel-faults.sh make it); a missing file fails the suite, it is never skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { load, check, judge, KernelError } from "./kernel.mjs";

const here = new URL(".", import.meta.url);
const bytes = (path) => new Uint8Array(readFileSync(new URL(path, here)));
const json = (path) => JSON.parse(readFileSync(new URL(path, here), "utf8"));
const manifest = json("manifest.json");
const wasm = bytes(manifest.checker.file);
const checker = await load(wasm, manifest.checker.address);
const exported = (name) => bytes(`dist/exports/${name}.ndjson`);
const AXIOMS = manifest.permitted_axioms;

const specs = {
  payment: { authority: json("evidence/payment.authority.json"), prefix: "PrismTextRequest.Payment.", theorems: ["viewKeepsRevision", "clearAdvances"] },
  guests: { authority: json("evidence/guests.authority.json"), prefix: "PrismTextRequest.App.", theorems: ["startsEmpty", "clearEmpties", "emptyIgnored", "longIgnored", "staleIgnored"] },
};

test("the manifest describes the built files, and they are the pinned toolchain's", () => {
  for (const [name, entry] of [["checker", manifest.checker], ...Object.entries(manifest.exports)]) {
    const file = name === "checker" ? wasm : exported(name);
    assert.equal("sha256:" + createHash("sha256").update(file).digest("hex"), entry.address, name);
  }
  const toolchain = readFileSync(new URL("../probe-payment/lean-toolchain", here), "utf8").trim();
  assert.equal(toolchain, `leanprover/lean4:v${manifest.exporter.lean}`);
  for (const name of Object.keys(manifest.exports)) {
    const meta = JSON.parse(new TextDecoder().decode(exported(name).subarray(0, 400)).split("\n")[0]).meta;
    assert.deepEqual([meta.lean.version, meta.lean.githash, meta.format.version], [manifest.exporter.lean, manifest.exporter.githash, manifest.exporter.format], name);
  }
  // The image's own record names the same Lean.
  for (const spec of Object.values(specs)) assert.match(spec.authority.toolchain.lean.version_output, /version 4\.32\.1, .*commit f054605aea4b840552cca2e725580bffd1e1b704/);
});

test("bytes that are not the manifest's are refused before they run", async () => {
  const other = wasm.slice(); other[other.length - 1] ^= 1;
  await assert.rejects(load(other, manifest.checker.address), (error) => error instanceof KernelError && error.code === "ITP_ADDRESS");
});

test("a module that imports anything but the eleven calls is refused", async () => {
  // (module (import "env" "fetch" (func)))
  const foreign = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 2, 13, 1, 3, 101, 110, 118, 5, 102, 101, 116, 99, 104, 0, 0]);
  await assert.rejects(load(foreign), (error) => error.code === "ITP_IMPORT");
});

for (const [name, spec] of Object.entries(specs)) {
  test(`${name}: the image verified it, and every theorem is kernel-checked in the tab with the image's axioms`, () => {
    assert.equal(spec.authority.status, "verified");
    for (const theorem of spec.theorems) {
      const full = spec.prefix + theorem;
      const row = spec.authority.declarations.find((d) => d.name === full);
      assert.equal(row.result, "ok", full);
      const verdict = judge(checker, exported(`${name}.${theorem}`), { theorem: full, axioms: row.observed });
      assert.equal(verdict.verdict, "kernel-checked", `${full}: ${verdict.why}`);
      assert.deepEqual(verdict.axioms, [...row.observed].sort(), full);
    }
  });

  test(`${name}: every declaration the image attests is accepted, with or without the library admitted by address`, () => {
    const whole = exported(`${name}.whole`), library = exported("library");
    const full = check(checker, whole, { permitted_axioms: AXIOMS });
    assert.equal(full.ok, true, full.refusal);
    const attested = spec.authority.declarations.map((d) => d.name).filter((n) => !n.endsWith("._unsafe_rec"));
    // The library is a prefix of the whole export, byte for byte: that is what makes admitting it sound.
    assert.deepEqual(whole.subarray(0, library.length), library);
    const libraryAlone = check(checker, library, { permitted_axioms: AXIOMS });
    assert.equal(libraryAlone.ok, true);
    const rest = check(checker, whole, { permitted_axioms: AXIOMS, admitted: libraryAlone.declarations });
    assert.equal(rest.ok, true, rest.refusal);
    assert.equal(rest.checked, full.declarations - libraryAlone.declarations);
    for (const theorem of spec.theorems) {
      assert.ok(full.theorems.includes(spec.prefix + theorem), theorem);
      assert.ok(rest.theorems.includes(spec.prefix + theorem), `${theorem} is checked, not admitted`);
    }
    assert.ok(full.declarations >= attested.length);
    assert.deepEqual([...full.axioms_in_environment].sort(), [...AXIOMS].sort());
  });
}

test("the checker is a function of its inputs: two instances, equal results", () => {
  const a = check(checker, exported("payment.clearAdvances"), { permitted_axioms: ["propext"] });
  const b = check(checker, exported("payment.clearAdvances"), { permitted_axioms: ["propext"] });
  assert.deepEqual(a, b);
});

// Faults given to Lean's own kernel in the image (evidence/kernel-faults.txt) and to the tab.
test("kernel-level faults: the tab refuses what Lean's kernel or LexLean's axiom rule refuses, and accepts the control", () => {
  const record = readFileSync(new URL("evidence/kernel-faults.txt", here), "utf8");
  const section = (name, tool) => record.split(`== ${name}: ${tool}\n`)[1].split("== ")[0];
  // The image: Lean itself accepted all three files.
  for (const name of ["True", "Sorry", "Hacked"]) assert.match(section(name, "lean"), /exit 0\n$/, name);
  assert.match(section("True", "leanchecker"), /^exit 0/);
  assert.match(section("Sorry", "leanchecker"), /^exit 0/); // the kernel accepts `sorry`: it is an axiom
  assert.match(section("Hacked", "leanchecker"), /declaration type mismatch[\s\S]*exit 1/);
  assert.match(record, /'Fault\.sorryAdvance' depends on axioms: \[sorryAx\]/);

  const control = judge(checker, exported("fault.true"), { theorem: "Fault.trueAdvance", axioms: ["propext"] });
  assert.equal(control.verdict, "kernel-checked", control.why);
  const hacked = judge(checker, exported("fault.hacked"), { theorem: "Fault.hackedAdvance", axioms: ["propext"] });
  assert.equal(hacked.verdict, "refused");
  assert.match(hacked.why, /^kernel: /);
  // `sorry` is refused under every axiom list a spec may declare, and also when the list names it: sorryAx is
  // refused by name here, as LexLean's policy has no way to declare it.
  for (const axioms of [[], ["propext"], AXIOMS]) {
    const sorry = judge(checker, exported("fault.sorry"), { theorem: "Fault.sorryAdvance", axioms });
    assert.equal(sorry.verdict, "refused", JSON.stringify(axioms));
    assert.match(sorry.why, /sorryAx/);
  }
});

test("spec-level faults: the image refuses each, so no export of them exists for a tab to accept", () => {
  const faults = json("evidence/spec-faults.json");
  assert.deepEqual(Object.keys(faults).sort(), ["broken-proof", "false-reflexivity", "false-statement", "wrong-axioms"]);
  for (const [name, outcome] of Object.entries(faults)) {
    assert.notEqual(outcome.exit_code, 0, name);
    assert.ok(outcome.diagnostics.some((d) => /^LLV70/.test(d.code)), `${name}: ${JSON.stringify(outcome.diagnostics.map((d) => d.code))}`);
  }
});

// Faults planted in the export itself: what an untrusted source of exports could send.
const lines = (name) => new TextDecoder().decode(exported(name)).split("\n").filter(Boolean);
const encode = (list) => new TextEncoder().encode(list.join("\n") + "\n");
const target = "PrismTextRequest.Payment.clearAdvances";

test("export faults: a theorem's statement or proof swapped for another's is refused", () => {
  const original = lines("payment.clearAdvances");
  const theorems = original.map((line, index) => ({ line, index })).filter((entry) => entry.line.startsWith('{"thm"'));
  const last = theorems.at(-1), other = JSON.parse(theorems.at(-2).line).thm;
  for (const field of ["type", "value"]) {
    const changed = JSON.parse(last.line);
    assert.notEqual(changed.thm[field], other[field]);
    changed.thm[field] = other[field];
    const mutated = [...original]; mutated[last.index] = JSON.stringify(changed);
    const verdict = judge(checker, encode(mutated), { theorem: target, axioms: ["propext"] });
    assert.equal(verdict.verdict, "refused", field);
    assert.match(verdict.why, /^kernel: /, field);
  }
});

test("export faults: an export that leaves the theorem out, or admits it unchecked, proves nothing about it", () => {
  const original = lines("payment.clearAdvances");
  const without = original.slice(0, original.findLastIndex((line) => line.startsWith('{"thm"')));
  const short = judge(checker, encode(without), { theorem: target, axioms: ["propext"] });
  assert.equal(short.verdict, "refused");
  assert.match(short.why, /does not check/);
  // The same through the checker's one non-rule option: everything admitted, nothing checked.
  const all = check(checker, exported("payment.clearAdvances"), { permitted_axioms: ["propext"] });
  const admitted = check(checker, exported("payment.clearAdvances"), { permitted_axioms: ["propext"], admitted: all.declarations });
  assert.equal(admitted.ok, true);
  assert.deepEqual(admitted.theorems, []);
  const beyond = check(checker, exported("payment.clearAdvances"), { permitted_axioms: ["propext"], admitted: all.declarations + 1 });
  assert.equal(beyond.ok, false);
});

test("export faults: a truncated or malformed export is refused, not read as a smaller one", () => {
  const whole = exported("payment.clearAdvances");
  const cut = check(checker, whole.subarray(0, whole.length - 40), { permitted_axioms: ["propext"] });
  assert.equal(cut.ok, false);
  // nanoda accepts an export of nothing: no declaration failed. The theorem rule is what refuses it.
  const empty = judge(checker, new Uint8Array(0), { theorem: target, axioms: [] });
  assert.equal(empty.verdict, "refused");
  assert.match(empty.why, /does not check/);
});

test("an axiom outside the declared list is refused, and so is a declared axiom the proof does not use", () => {
  const none = judge(checker, exported("payment.clearAdvances"), { theorem: target, axioms: [] });
  assert.equal(none.verdict, "refused");
  assert.match(none.why, /propext/);
  const more = judge(checker, exported("payment.clearAdvances"), { theorem: target, axioms: ["Quot.sound", "propext"] });
  assert.equal(more.verdict, "refused");
  assert.match(more.why, /declared \[Quot\.sound, propext\]/);
});
