// Run: node v2/reuse/bench.mjs   Prints medians (ms) over repeated runs. Measured, single machine.
import { readFileSync } from "node:fs";
import { loadProject } from "../shell/interp.mjs";
import { blake3 } from "../../studio/shell/prism-code/src/blake3.mjs";
import { loadModelNode } from "./adapter/model.mjs";
import { toolchainId, addressDeclarations, plan } from "./adapter/address.mjs";
import { createProofCache, memoryTransport } from "./adapter/proof-cache.mjs";
import { createStore, memoryBackend } from "./adapter/store.mjs";
import { createAhead } from "./adapter/ahead.mjs";

const model = await loadModelNode();
const enc = new TextEncoder();
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)]; };
async function time(label, runs, fn) {
  for (let i = 0; i < Math.min(5, runs); i++) await fn(i);
  const xs = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); await fn(i); xs.push(performance.now() - t); }
  const row = { label, runs, median: +median(xs).toFixed(3), p95: +p95(xs).toFixed(3) };
  console.log(JSON.stringify(row));
  return row;
}

// A module of 200 declarations: each depends on up to three earlier ones; bodies of about 200 bytes.
const toolchain = toolchainId(model, { semantics: "s", lean: "leanprover/lean4:v4.32.1", lexicons: "lexlean.core@1.2.0" });
const decls = Array.from({ length: 200 }, (_, i) => ({
  name: "d" + i, kind: 2, body: ("definition d" + i + " ").padEnd(200, "x"),
  dependsOn: [i - 1, i - 7, i - 31].filter((j) => j >= 0).map((j) => "d" + j),
}));
const before = addressDeclarations(model, toolchain, decls);
const edited = decls.map((d) => (d.name === "d100" ? { ...d, body: d.body + "y" } : d));
const after = addressDeclarations(model, toolchain, edited);
console.log("edit d100 re-checks", plan(model, before, after).recheck.length, "of 200");
const leaf = addressDeclarations(model, toolchain, decls.map((d) => (d.name === "d199" ? { ...d, body: d.body + "y" } : d)));
console.log("edit d199 re-checks", plan(model, before, leaf).recheck.length, "of 200");
await time("address 200 declarations (hash + model preimages)", 30, () => addressDeclarations(model, toolchain, edited));
await time("staleness decision for 200 declarations (model recheck + reasons)", 30, () => plan(model, before, after));

const query = { address: 11n, toolchain: 22n, claim: 1n };
const attestation = enc.encode("x".repeat(2048));
const transport = memoryTransport(), cache = createProofCache(model, transport);
await cache.obtain(query, async () => attestation);
await time("proof cache hit (consult, verify attestation, admit, reuse)", 500, () => cache.obtain(query, async () => attestation));
let n = 0;
await time("proof cache miss (consult, refuse, run no-op work, publish)", 500, () => cache.obtain({ ...query, address: BigInt(1000 + n++) }, async () => attestation));

for (const size of [1024, 65536]) {
  const store = createStore(model, memoryBackend());
  const hex = await store.put(new Uint8Array(size).fill(7));
  await time(`store get, ${size} bytes, verified (memory backend)`, 300, () => store.get(hex));
}
const raw = new Uint8Array(65536).fill(7);
await time("BLAKE3 alone, 65536 bytes", 300, () => blake3(raw));

const probe = loadProject({ Probe: JSON.parse(readFileSync(new URL("../probe/Probe.json", import.meta.url), "utf8")) });
const counter = { address: 1n, dispatch: (s, e) => { const r = new Uint8Array(8); r.set(s); r.set(e, 4); return probe.call("Probe::dispatch", r); } };
const ON = [enc.encode("0000"), enc.encode("0100")], state = enc.encode("0503");
const ahead = createAhead(model, counter, createStore(model, memoryBackend()));
await ahead.prepare(state, ON);
await time("counter: compute (dispatch)", 1000, (i) => counter.dispatch(state, ON[i % 2]));
await time("counter: compute-ahead hit (decide + verified read)", 1000, (i) => ahead.respond(state, ON[i % 2]));

const { project } = await import("../probe-view/project.mjs");
// The probe-view request: state as 4 hex chars, then a CBOR intent (revision 5, action 1 or 2).
const viewDispatch = (s, e) => { const r = new Uint8Array(s.length + e.length); r.set(s); r.set(e, s.length); return project.call("TextRequest::dispatch", r); };
const vState = enc.encode("0501"), vEvents = [new Uint8Array([0x84, 0x01, 0x05, 0x01, 0x80]), new Uint8Array([0x84, 0x01, 0x05, 0x02, 0x80])];
const viewApp = { address: 2n, dispatch: viewDispatch };
const aheadView = createAhead(model, viewApp, createStore(model, memoryBackend()));
await aheadView.prepare(vState, vEvents);
console.log("library view responses valid:", vEvents.map((e) => new TextDecoder().decode(viewDispatch(vState, e)).slice(0, 4)));
await time("library view: compute (dispatch through the CBOR codec)", 300, (i) => viewDispatch(vState, vEvents[i % 2]));
await time("library view: compute-ahead hit (decide + verified read)", 300, (i) => aheadView.respond(vState, vEvents[i % 2]));
