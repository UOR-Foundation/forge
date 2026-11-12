// Run: node --test v2/reuse/test.mjs
// Every decision below is made by the LexLean model (data/*.json) through the interpreter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadProject } from "../shell/interp.mjs";
import { blake3 } from "../../studio/shell/prism-code/src/blake3.mjs";
import { loadModelNode, list, toArray, natToHex, digestToNat, ReuseError } from "./adapter/model.mjs";
import { toolchainId, addressDeclarations, plan } from "./adapter/address.mjs";
import { createProofCache, memoryTransport } from "./adapter/proof-cache.mjs";
import { createStore, memoryBackend } from "./adapter/store.mjs";
import { createAhead } from "./adapter/ahead.mjs";

const model = await loadModelNode();
const enc = new TextEncoder(), dec = new TextDecoder();
const TOOLS = { semantics: "lexlean-semantics/2", lean: "leanprover/lean4:v4.32.1", lexicons: "lexlean.core@1.2.0 lexlean.std.bool@1.2.0 lexlean.std.nat@1.2.0" };
const toolchain = toolchainId(model, TOOLS);

// ---- Mechanism 1: address every declaration ----

const module = () => [
  { name: "State", kind: 1, body: "structure State {count : Nat}", dependsOn: [] },
  { name: "step", kind: 2, body: "step s = s.count + 1", dependsOn: ["State"] },
  { name: "view", kind: 2, body: "view s = text s.count", dependsOn: ["State"] },
  { name: "stepGrows", kind: 3, body: "theorem step s > s.count", dependsOn: ["step", "State"] },
];
const edit = (decls, name, body) => decls.map((d) => (d.name === name ? { ...d, body } : d));

test("the hash is BLAKE3: the official empty-input vector", () => {
  assert.equal(Buffer.from(blake3(new Uint8Array())).toString("hex"), "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262");
});

test("the model's preimage carries the toolchain, the kind, the name and the bytes, framed", () => {
  const hex = (b) => Buffer.from(b).toString("hex"), tag = (t) => hex(enc.encode(t));
  const n8 = (n) => n.toString(16).padStart(16, "0");
  const pre = model.call("Address::toolchainPreimage", { semantics: enc.encode("a"), lean: enc.encode("bc"), lexicons: enc.encode("") });
  assert.equal(hex(pre), tag("prism/reuse/toolchain/1\n") + n8(1) + tag("a") + n8(2) + tag("bc") + n8(0));
  const own = model.call("Address::ownPreimage", { kind: 3n, name: enc.encode("x"), body: enc.encode("yz"), dependencies: list([]) });
  assert.equal(hex(own), tag("prism/reuse/declaration/1\n") + n8(3) + n8(1) + tag("x") + n8(2) + tag("yz"));
  const key = model.call("Address::keyPreimage", { toolchain: 1n, own: 2n ** 255n, dependencies: 258n });
  assert.equal(hex(key), tag("prism/reuse/key/1\n") + "1".padStart(64, "0") + "8".padEnd(64, "0") + "102".padStart(64, "0"));
});

test("an unchanged declaration with unchanged dependencies keeps its address", () => {
  const a = addressDeclarations(model, toolchain, module()), b = addressDeclarations(model, toolchain, module());
  for (const [name, entry] of a) assert.equal(b.get(name).address, entry.address, name);
  assert.deepEqual(plan(model, a, b).recheck, []);
});

test("an edit re-checks the declaration and everything that depends on it, and nothing else", () => {
  const before = addressDeclarations(model, toolchain, module());
  const after = addressDeclarations(model, toolchain, edit(module(), "step", "step s = s.count + 2"));
  const { recheck, reasons } = plan(model, before, after);
  assert.deepEqual(recheck, ["step", "stepGrows"]);
  assert.equal(reasons.get("step"), "ownChanged");
  assert.equal(reasons.get("stepGrows"), "dependencyChanged");
  assert.equal(reasons.get("view"), "fresh");
  assert.notEqual(before.get("stepGrows").address, after.get("stepGrows").address);
});

test("a change deep in the graph reaches every transitive dependent", () => {
  const before = addressDeclarations(model, toolchain, module());
  const after = addressDeclarations(model, toolchain, edit(module(), "State", "structure State {count : Nat, stride : Nat}"));
  assert.deepEqual(plan(model, before, after).recheck, ["State", "step", "view", "stepGrows"]);
});

test("nothing is reused across a toolchain change", () => {
  const before = addressDeclarations(model, toolchain, module());
  const other = toolchainId(model, { ...TOOLS, lean: "leanprover/lean4:v4.33.0" });
  const after = addressDeclarations(model, other, module());
  const { recheck, reasons } = plan(model, before, after);
  assert.deepEqual(recheck, ["State", "step", "view", "stepGrows"]);
  for (const r of reasons.values()) assert.equal(r, "toolchainChanged");
});

test("a new declaration is added, not fresh", () => {
  const before = addressDeclarations(model, toolchain, module().slice(0, 3));
  const { recheck, reasons } = plan(model, before, addressDeclarations(model, toolchain, module()));
  assert.deepEqual(recheck, ["stepGrows"]);
  assert.equal(reasons.get("stepGrows"), "added");
});

test("dependency order does not change an address", () => {
  const a = addressDeclarations(model, toolchain, module());
  const b = addressDeclarations(model, toolchain, module().map((d) => ({ ...d, dependsOn: [...d.dependsOn].reverse() })));
  assert.equal(a.get("stepGrows").address, b.get("stepGrows").address);
});

test("refusals: cycles, unknown dependencies and duplicate names are typed", () => {
  const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof ReuseError); return e.code; } return null; };
  assert.equal(code(() => addressDeclarations(model, toolchain, [{ name: "a", kind: 2, body: "", dependsOn: ["b"] }, { name: "b", kind: 2, body: "", dependsOn: ["a"] }])), "reuse.cycle");
  assert.equal(code(() => addressDeclarations(model, toolchain, [{ name: "a", kind: 2, body: "", dependsOn: ["zz"] }])), "reuse.unknownDependency");
  assert.equal(code(() => addressDeclarations(model, toolchain, [{ name: "a", kind: 2, body: "" }, { name: "a", kind: 2, body: "" }])), "reuse.duplicateName");
  assert.equal(model.call("Address::dependenciesValid", list([5n, 5n])), false);
});

test("framing: moving bytes between name and body changes the address", () => {
  const one = addressDeclarations(model, toolchain, [{ name: "ab", kind: 2, body: "c", dependsOn: [] }]);
  const two = addressDeclarations(model, toolchain, [{ name: "a", kind: 2, body: "bc", dependsOn: [] }]);
  assert.notEqual(one.get("ab").address, two.get("a").address);
});

// ---- Mechanism 2: share the proof cache ----

const query = { address: 11n, toolchain: 22n, claim: 1n };
const attestation = enc.encode('{"verified":true,"axioms":["propext"]}');

test("a miss runs the work once, publishes it, and the next caller reuses it without working", async () => {
  const transport = memoryTransport(), cache = createProofCache(model, transport);
  let runs = 0;
  const work = async () => { runs++; return attestation; };
  const first = await cache.obtain(query, work);
  assert.equal(first.reused, false); assert.equal(first.refusal, "absent");
  const second = await createProofCache(model, transport).obtain(query, work);
  assert.equal(second.reused, true); assert.equal(runs, 1);
  assert.deepEqual(second.attestation, attestation);
});

test("refusals: every mismatch and a missing or altered attestation is refused with its reason", () => {
  const cache = createProofCache(model, memoryTransport());
  const good = { ...query, attestation, attestationAddress: cache.attestationAddress(attestation) };
  assert.deepEqual(cache.admit(query, good), { admitted: true, attestationAddress: good.attestationAddress });
  assert.equal(cache.admit(query, { ...good, address: 12n }).refusal, "addressMismatch");
  assert.equal(cache.admit(query, { ...good, toolchain: 23n }).refusal, "toolchainMismatch");
  assert.equal(cache.admit(query, { ...good, claim: 0n }).refusal, "claimMismatch");
  assert.equal(cache.admit(query, { ...good, attestationAddress: null }).refusal, "attestationMissing");
  assert.equal(cache.admit(query, { ...good, attestation: null }).refusal, "attestationUnverified");
  assert.equal(cache.admit(query, { ...good, attestation: enc.encode('{"verified":false}') }).refusal, "attestationUnverified");
});

test("a dishonest server's record is refused and the work runs", async () => {
  const transport = memoryTransport(), cache = createProofCache(model, transport);
  await transport.put({ ...query, attestation: enc.encode("forged"), attestationAddress: cache.attestationAddress(attestation) });
  let runs = 0;
  const r = await cache.obtain(query, async () => { runs++; return attestation; });
  assert.equal(r.reused, false); assert.equal(r.refusal, "attestationUnverified"); assert.equal(runs, 1);
});

test("the model consults before any work", () => {
  assert.equal(model.call("ProofCache::nextStep", 0n, query, { c: "Option.none", a: [] }, { c: "Option.none", a: [] }).c, "ProofCache::Step.consult");
  for (const code of [0n, 1n, 5n]) assert.equal(model.call("ProofCache::nextStepCode", 0n, code), 0n);
});

// ---- Mechanism 3: store by address ----

test("put then get returns the bytes; the address is the model's blob preimage hashed", async () => {
  const store = createStore(model, memoryBackend());
  const bytes = enc.encode("hello");
  const hex = await store.put(bytes);
  assert.equal(hex, Buffer.from(blake3(new Uint8Array([...enc.encode("prism/reuse/blob/1\n"), 0, 0, 0, 0, 0, 0, 0, 5, ...enc.encode("hello")]))).toString("hex"));
  assert.deepEqual(await store.get(hex), bytes);
  assert.equal(await store.put(bytes), hex, "same bytes, same address");
});

test("refusals: altered bytes, a missing address and a malformed address", async () => {
  const backend = memoryBackend(), store = createStore(model, backend);
  const hex = await store.put(enc.encode("hello"));
  backend.maps.blob.set(hex, enc.encode("hellp"));
  await assert.rejects(store.get(hex), (e) => e.code === "store.mismatch");
  await assert.rejects(store.get("0".repeat(64)), (e) => e.code === "store.missing");
  await assert.rejects(store.get("XYZ"), (e) => e.code === "reuse.address");
});

test("a snapshot is one address; restore returns every member", async () => {
  const store = createStore(model, memoryBackend());
  const members = await Promise.all(["spec", "data form", "view"].map((t) => store.put(enc.encode(t))));
  const snap = await store.snapshot(members);
  const restored = await store.restore(snap);
  assert.deepEqual([...restored.keys()].sort(), [...members].sort());
});

test("a snapshot's address is independent of insertion order (every permutation of 5, and random sets)", async () => {
  const store = createStore(model, memoryBackend());
  const members = await Promise.all(["a", "b", "c", "d", "e"].map((t) => store.put(enc.encode(t))));
  const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  const seen = new Set();
  for (const p of perms(members)) seen.add(await store.snapshot(p));
  assert.equal(seen.size, 1);
  for (let round = 0; round < 20; round++) {
    const set = Array.from({ length: 1 + (round % 9) }, (_, i) => natToHex(digestToNat(blake3(enc.encode(`${round}-${i}`)))));
    const shuffled = [...set].sort(() => Math.random() - 0.5);
    assert.equal(await store.snapshot(shuffled), await store.snapshot(set));
  }
});

test("refusals: restore of a tampered snapshot, of a missing member, and a duplicate member", async () => {
  const backend = memoryBackend(), store = createStore(model, backend);
  const a = await store.put(enc.encode("a")), b = await store.put(enc.encode("b"));
  const snap = await store.snapshot([a, b]);
  const original = backend.maps.snapshot.get(snap);
  const tampered = original.slice(); tampered[tampered.length - 1] ^= 1;
  backend.maps.snapshot.set(snap, tampered);
  await assert.rejects(store.restore(snap), (e) => e.code === "store.mismatch");
  backend.maps.snapshot.set(snap, original);
  backend.maps.blob.delete(b);
  await assert.rejects(store.restore(snap), (e) => e.code === "store.mismatch");
  await assert.rejects(store.snapshot([a, a]), (e) => e.code === "store.duplicateMember");
});

// ---- Mechanism 4: compute ahead ----

const probe = loadProject({ Probe: JSON.parse(readFileSync(new URL("../probe/Probe.json", import.meta.url), "utf8")) });
const counter = {
  address: digestToNat(blake3(readFileSync(new URL("../probe/Probe.json", import.meta.url)))),
  dispatch: (state, event) => { const r = new Uint8Array(8); r.set(state); r.set(event, 4); return probe.call("Probe::dispatch", r); },
};
const ON_SCREEN = [enc.encode("0000"), enc.encode("0100")];

test("a hit equals computing, for every action on screen across many states", async () => {
  const ahead = createAhead(model, counter, createStore(model, memoryBackend()));
  for (let count = 0; count < 250; count += 7) {
    const state = enc.encode(count.toString(16).padStart(2, "0") + "03");
    await ahead.prepare(state, ON_SCREEN);
    for (const event of ON_SCREEN) {
      const r = await ahead.respond(state, event);
      assert.equal(r.hit, true);
      assert.deepEqual(r.response, counter.dispatch(state, event));
    }
  }
});

test("a state change invalidates every entry; an event not on screen is computed", async () => {
  const ahead = createAhead(model, counter, createStore(model, memoryBackend()));
  const state = enc.encode("0503");
  await ahead.prepare(state, ON_SCREEN);
  for (const event of ON_SCREEN) assert.equal((await ahead.respond(enc.encode("0603"), event)).hit, false);
  const r = await ahead.respond(state, enc.encode("0207"));
  assert.equal(r.hit, false); assert.deepEqual(r.response, counter.dispatch(state, enc.encode("0207")));
});

test("another app's table never answers", async () => {
  const store = createStore(model, memoryBackend());
  const ahead = createAhead(model, counter, store);
  await ahead.prepare(enc.encode("0503"), ON_SCREEN);
  const event = store.blobAddress(ON_SCREEN[0]);
  assert.equal(model.call("Ahead::answer", ahead.table, counter.address, ahead.table.state, event).c, "Ahead::Answer.hit");
  assert.equal(model.call("Ahead::answer", ahead.table, counter.address + 1n, ahead.table.state, event).c, "Ahead::Answer.compute");
});

test("a corrupted precomputed response is refused, not served", async () => {
  const backend = memoryBackend(), ahead = createAhead(model, counter, createStore(model, backend));
  const state = enc.encode("0503");
  await ahead.prepare(state, ON_SCREEN);
  for (const [hex, bytes] of backend.maps.blob) { const b = bytes.slice(); b[0] ^= 1; backend.maps.blob.set(hex, b); }
  await assert.rejects(ahead.respond(state, ON_SCREEN[0]), (e) => e.code === "store.mismatch");
});

test("the model's own statement of the counter instance agrees with the interpreter", () => {
  for (const event of [0n, 1n, 2n, 9n]) {
    const t = model.call("Ahead::counterTable", 7n, 8n, 5n, 3n);
    const hit = model.call("Ahead::lookupCode", t, 7n, 8n, event);
    if (hit === 1n) assert.equal(model.call("Ahead::lookupValue", t, 7n, 8n, event), model.call("Ahead::counterStep", 5n, 3n, event));
    else assert.ok(event > 1n);
  }
});

test("theorems are listed for every mechanism, not run", () => {
  const names = model.theorems;
  for (const t of ["Address::nothingReusedAcrossToolchains", "ProofCache::noAdmissionOnAddressMismatch", "Store::restoreRefusesMismatch", "Ahead::stateChangeInvalidatesEveryEntry", "Encoding::pairOrderFree"]) assert.ok(names.includes(t), t);
  assert.ok(toArray(list([1n])).length === 1);
});
