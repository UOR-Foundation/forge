// The on-device engine has one door, device-engine.mjs. These tests hold the door's contract with fake
// engine modules (the real ones need WebGPU) and read the shell's source to hold that it is the only door.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createDeviceEngine, snapshotAdapter } from "../shell/device-engine.mjs";

const shell = fileURLToPath(new URL("../shell/", import.meta.url));
const CATALOGUE = [{ fam: "TernaryBonsai", cap: 900, ctx: 3000 }, { fam: "Bonsai", cap: 900, ctx: 3000 }];

// A fake of the four snapshot modules the door may import, with a record of what was asked of them.
function fakeSnapshot({ loaded = { gpu: {} }, failFirst = new Set() } = {}) {
  const calls = { imports: [], ready: 0, init: 0, loadModel: [], createEngine: [], frames: [], verified: [] };
  const handle = { tokenize: (t) => [...t].map((c) => c.charCodeAt(0)), bosId: 1, generate: async () => ({}), buildReceipt: async () => ({}) };
  const modules = {
    "core/loader.js": { MODELS: CATALOGUE, ready: async () => { calls.ready++; }, loadModel: async (entry, progress) => { calls.loadModel.push({ entry, progress }); progress.onProgress?.(1, 2); return loaded; } },
    "core/engine.js": { createEngine: async (entry, l) => { calls.createEngine.push({ entry, loaded: l }); return handle; } },
    "core/q-brain-fast.mjs": { frameHistory: (entry, messages) => { calls.frames.push(entry.fam); return messages.map((m) => m.content).join("|"); } },
    "core/kappa.js": { verifyIntegrity: async (r) => { calls.verified.push(r); return { ok: r === "good" }; } },
    "pkg/holospaces_web.js": { default: async () => { calls.init++; }, kappa: (bytes) => "blake3:" + bytes.length },
  };
  const importer = async (p) => {
    calls.imports.push(p);
    if (failFirst.delete(p)) throw new Error("network");
    if (!modules[p]) throw new Error("the door imported an unknown module " + p);
    return modules[p];
  };
  return { importer, calls, handle };
}

test("a model loads through the snapshot adapter, and the handle it gives is the engine's own", async () => {
  const fake = fakeSnapshot();
  const device = createDeviceEngine([snapshotAdapter(fake.importer)]);
  const entry = await device.model("TernaryBonsai");
  assert.equal(entry, CATALOGUE[0]);
  const seen = [];
  const handle = await device.load(entry, { onStatus: () => {}, onProgress: (d, t) => seen.push([d, t]) });
  assert.equal(handle, fake.handle);
  assert.deepEqual(seen, [[1, 2]]);
  assert.equal(fake.calls.createEngine.length, 1);
  assert.equal(fake.calls.createEngine[0].entry, entry);
  assert.equal(fake.calls.ready, 1);
});

test("a load the engine answers without a GPU is refused, and nothing is built", async () => {
  for (const loaded of [null, {}, { gpu: null }]) {
    const fake = fakeSnapshot({ loaded });
    const device = createDeviceEngine([snapshotAdapter(fake.importer)]);
    await assert.rejects(device.load(CATALOGUE[0]), /model load failed/);
    assert.equal(fake.calls.createEngine.length, 0);
  }
});

test("a family the catalogue does not list is refused by name", async () => {
  const device = createDeviceEngine([snapshotAdapter(fakeSnapshot().importer)]);
  await assert.rejects(device.model("Phi"), /no Phi model/);
});

test("a prompt is framed only after the engine is loaded, and then by the engine's own framing", async () => {
  const fake = fakeSnapshot();
  const device = createDeviceEngine([snapshotAdapter(fake.importer)]);
  assert.throws(() => device.frame(CATALOGUE[0], [{ content: "a" }]), /only after a model is loaded/);
  await device.load(CATALOGUE[0]);
  assert.equal(device.frame(CATALOGUE[0], [{ content: "a" }, { content: "b" }]), "a|b");
});

test("a model goes to the first adapter that runs it; every other model falls back to the snapshot", async () => {
  const fake = fakeSnapshot();
  const other = { handle: { tokenize: () => [] }, loads: [] };
  const second = {
    name: "second", runs: (entry) => entry.fam === "TernaryBonsai",
    frame: () => "second frame", load: async (entry) => { other.loads.push(entry); return other.handle; },
    catalogue: async () => { throw new Error("only the fallback lists models"); },
    hasher: async () => { throw new Error("only the fallback hashes"); },
    verifyReceipt: async () => { throw new Error("only the fallback verifies"); },
  };
  const device = createDeviceEngine([second, snapshotAdapter(fake.importer)]);
  assert.equal(await device.load(CATALOGUE[0]), other.handle);
  assert.equal(await device.load(CATALOGUE[1]), fake.handle);
  assert.deepEqual(other.loads, [CATALOGUE[0]]);
  assert.equal(fake.calls.createEngine.length, 1);
  assert.equal(fake.calls.createEngine[0].entry, CATALOGUE[1]);
  assert.equal(device.frame(CATALOGUE[0], []), "second frame");
  // Addresses and receipts stay the snapshot's, so seals written before a model moved still verify.
  assert.equal(await device.hash(new Uint8Array(3)), "blake3:3");
  assert.deepEqual(await device.verifyReceipt("good"), { ok: true });
});

test("hashing initialises the engine's wasm once, and a failed import is tried again", async () => {
  const fake = fakeSnapshot({ failFirst: new Set(["pkg/holospaces_web.js"]) });
  const device = createDeviceEngine([snapshotAdapter(fake.importer)]);
  await assert.rejects(device.hash(new Uint8Array(1)), /network/);
  const hash = await device.hasher();
  assert.equal(hash(new Uint8Array(5)), "blake3:5");
  assert.equal(await device.hash(new Uint8Array(2)), "blake3:2");
  assert.equal(await device.hasher(), hash);
  assert.equal(fake.calls.init, 1);
});

test("a failed engine import is tried again on the next load", async () => {
  const fake = fakeSnapshot({ failFirst: new Set(["core/engine.js"]) });
  const device = createDeviceEngine([snapshotAdapter(fake.importer)]);
  await assert.rejects(device.load(CATALOGUE[0]), /network/);
  assert.equal(await device.load(CATALOGUE[0]), fake.handle);
});

test("a receipt is verified by the engine's own integrity check", async () => {
  const fake = fakeSnapshot();
  const device = createDeviceEngine([snapshotAdapter(fake.importer)]);
  assert.deepEqual(await device.verifyReceipt("bad"), { ok: false });
  assert.deepEqual(fake.calls.verified, ["bad"]);
});

test("a device engine with no adapter is refused", () => {
  assert.throws(() => createDeviceEngine([]), /at least one adapter/);
});

// Every shell file that names a module under q/ in a string, outside q/ itself.
export function engineDoors(root = shell) {
  const doors = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) { if (rel !== "q") walk(full); continue; }
      if (!/\.(m?js|html)$/.test(entry.name)) continue;
      const source = fs.readFileSync(full, "utf8");
      if (/["'`](\.{0,2}\/)?q\/[\w./-]*["'`]/.test(source)) doors.push(rel);
    }
  };
  walk(root);
  return doors.sort();
}

test("device-engine.mjs is the only shell file that names the engine under q/", () => {
  assert.deepEqual(engineDoors(), ["device-engine.mjs"]);
});

test("the door check sees a second door, in any of the forms an import takes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shell-doors-"));
  try {
    fs.mkdirSync(path.join(dir, "q", "core"), { recursive: true });
    fs.writeFileSync(path.join(dir, "q", "core", "engine.js"), 'import "./loader.js"; const x = "q/core/engine.js";');
    fs.writeFileSync(path.join(dir, "device-engine.mjs"), 'new URL("./q/", import.meta.url)');
    fs.writeFileSync(path.join(dir, "a.js"), 'await import(new URL("q/core/loader.js", BASE).href)');
    fs.writeFileSync(path.join(dir, "b.mjs"), "import { x } from './q/core/engine.js';");
    fs.writeFileSync(path.join(dir, "c.html"), '<script type="module" src="q/pkg/holospaces_web.js"></script>');
    fs.writeFileSync(path.join(dir, "d.js"), "// a comment that cites q/core/loader.js is not a door");
    assert.deepEqual(engineDoors(dir), ["a.js", "b.mjs", "c.html", "device-engine.mjs"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
