import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { test } from "node:test";
import { executeWorkWithGuest } from "../shell/work-codec.mjs";
import { admitWithGuest } from "../shell/composition-codec.mjs";
const source = fs.readFileSync(new URL("../shell/kernel.js", import.meta.url), "utf8");
const originalMeta = JSON.parse(fs.readFileSync(new URL("../shell/kernel/kernel.json", import.meta.url)));
const originalBytes = fs.readFileSync(new URL("../shell/kernel/guest.wasm", import.meta.url));
const self = {};
vm.runInNewContext(source, { self, crypto: webcrypto, WebAssembly, TextEncoder, TextDecoder, Uint8Array, atob });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function load({ meta = structuredClone(originalMeta), bytes = originalBytes, get } = {}) {
  return self.ForgeKernel.load(get ?? (async path => path === "kernel/kernel.json" ? new Response(JSON.stringify(meta)) : new Response(bytes)));
}
const code = expected => error => error.code === expected;
test("the actual pinned guest replays its corpus and preserves phase behavior", async () => {
  const guest = await load(); assert.ok(guest.vectors > 0);
  assert.equal(guest.digest, originalMeta.digest);
  assert.equal(await guest.ask("drafting check"), "checked");
  assert.equal(await guest.ask("proved publish"), "published");
});
test("metadata refuses vacuity, incoherent bounds, wrong paths and malformed encodings", async () => {
  for (const change of [m => m.vectors = [], m => m.limits.request = m.limits.guestAllocation + 1, m => m.limits.response = 0, m => m.guest.path = "https://example.test/guest", m => m.guest.bytes = 16 * 1024 * 1024 + 1, m => m.digest = [m.digest], m => m.vectors[0] = ["bad base64", ""], m => m.vectors[0] = ["", "", ""]]) {
    const meta = structuredClone(originalMeta); change(meta);
    await assert.rejects(load({ meta }), code("invalidKernelMetadata"));
  }
});
test("missing resources, corrupt bytes and incorrect byte length refuse", async () => {
  await assert.rejects(load({ get: async () => new Response("missing", { status: 404 }) }), code("kernelLoadFailed"));
  const bytes = Uint8Array.from(originalBytes); bytes[20] ^= 1;
  await assert.rejects(load({ bytes }), code("kernelIntegrityMismatch"));
  const meta = structuredClone(originalMeta); meta.guest.bytes++;
  await assert.rejects(load({ meta }), code("kernelIntegrityMismatch"));
});
test("a correctly hashed module still needs the pure core ABI and matching vectors", async () => {
  const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  let meta = structuredClone(originalMeta); meta.guest.bytes = bytes.length; meta.guest.sha256 = sha(bytes);
  await assert.rejects(load({ meta, bytes }), code("kernelExportsMismatch"));
  meta = structuredClone(originalMeta); meta.vectors[0][1] = Buffer.from("forged").toString("base64");
  await assert.rejects(load({ meta }), code("kernelAcceptanceFailed"));
});
test("public requests are typed, bounded and isolated from caller mutation", async () => {
  const guest = await load();
  await assert.rejects(guest.dispatch("drafting check"), code("invalidKernelRequest"));
  await assert.rejects(guest.dispatch(Object.create(Uint8Array.prototype)), code("invalidKernelRequest"));
  await assert.rejects(guest.dispatch(new Proxy(new Uint8Array(), {})), code("invalidKernelRequest"));
  await assert.rejects(guest.ask({ toString: () => "drafting check" }), code("invalidKernelRequest"));
  await assert.rejects(guest.dispatch(new Uint8Array(originalMeta.limits.request + 1)), code("kernelRequestTooLarge"));
  const bytes = new TextEncoder().encode("drafting check");
  bytes.slice = () => { throw Error("caller-owned method must not run"); };
  const pending = guest.dispatch(bytes); bytes.fill(0);
  assert.equal(new TextDecoder().decode(await pending), "checked");
});
test("execution and output limits remain enforced after successful loading", async () => {
  const meta = structuredClone(originalMeta);
  meta.vectors = [[Buffer.from("drafting check").toString("base64"), Buffer.from("checked").toString("base64")]];
  meta.limits.response = 7;
  const short = await load({ meta });
  await assert.rejects(short.ask("proved publish"), code("kernelResponseTooLarge"));
  meta.limits.request = meta.limits.guestAllocation = 1024 * 1024;
  const oversized = await load({ meta });
  await assert.rejects(oversized.dispatch(new Uint8Array(1024 * 1024)), code("kernelExecutionFailed"));
});
test("the actual browser host delegates every structured composition case to the guest", async () => {
  const guest = await load(), handlers = new Map();
  const host = fs.readFileSync(new URL("../shell/host.js", import.meta.url), "utf8");
  const start = host.indexOf('handlers.set("forge:compose"'), end = host.indexOf("const PHASES", start);
  vm.runInNewContext(host.slice(start, end), { handlers, kernelReady: Promise.resolve(guest), admitWithGuest, executeWorkWithGuest });
  const handler = handlers.get("forge:compose"); assert.equal(typeof handler, "function");
  for (const input of [undefined, null, {}, { policy: {}, features: [], extra: true }]) assert.equal((await handler(input)).code, "malformedComposition");
  const vectors = JSON.parse(fs.readFileSync(new URL("../../verification/composition-wire-vectors.json", import.meta.url)));
  assert.ok(vectors.filter(v => v.policy).length >= 15);
  for (const vector of vectors.filter(v => v.policy)) {
    const result = await handler({ policy: vector.policy, features: vector.features });
    assert.equal(result.ok, vector.response === "accepted", vector.name);
    if (!result.ok) assert.equal(result.code, vector.response, vector.name);
  }
});

test("the actual guest preserves work through suspension, transfer and completion", async () => {
  const guest = await load();
  const vectors = JSON.parse(fs.readFileSync(new URL("../../verification/work-wire-vectors.json", import.meta.url))).vectors;
  assert.equal(vectors.length, 30);
  for (const vector of vectors) assert.equal(await guest.ask(vector.request), vector.response, vector.name);
  const host = fs.readFileSync(new URL("../shell/host.js", import.meta.url), "utf8");
  const line = host.split("\n").find(value => value.startsWith('handlers.set("forge:work",'));
  assert.ok(line); const handlers = new Map();
  vm.runInNewContext(line, { handlers, kernelReady: Promise.resolve(guest), executeWorkWithGuest });
  const run = handlers.get("forge:work");
  let result = await run({ kind: "initialize", owner: 7, capacity: 20, remaining: 2 });
  assert.equal(result.ok, true);
  for (const action of [{ kind: "reserve", amount: 10 }, { kind: "start" }, { kind: "progress", cost: 3, units: 1, checkpoint: 7 }, { kind: "pause" }, { kind: "transfer", owner: 9 }, { kind: "resume" }, { kind: "progress", cost: 7, units: 1, checkpoint: 8 }, { kind: "finish" }]) {
    const state = result.state;
    result = await run({ kind: "transition", state, owner: state.owner, revision: state.revision, action });
    assert.equal(result.ok, true, action.kind);
  }
  assert.deepEqual(result.state, { owner: 9, revision: 8, capacity: 20, spent: 10, reserved: 0, checkpoint: 8, remaining: 0, phase: 3 });
});
