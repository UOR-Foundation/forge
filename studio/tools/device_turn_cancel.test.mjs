// Stopping a device turn. The actual `deviceGenerate` from host.js and the actual engine lock from
// inference.js run against a fake engine that steps the way the snapshot's `generate` does: it checks the
// signal before each step and returns what it has when the signal is set.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { assertGenerationActive } from "../shell/generation-patch.mjs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const host = read("../shell/host.js"), inference = read("../shell/inference.js");
function block(text, start, end) {
  const at = text.indexOf(start);
  assert.ok(at >= 0, `missing ${start}`);
  const stop = text.indexOf(end, at);
  assert.ok(stop > at, `missing the end of ${start}`);
  return text.slice(at, stop + end.length);
}
const helper = block(host, "async function deviceGenerate(", "\n}\n");
const lock = block(inference, "let gpuBusy = Promise.resolve();", "return run; }\n").replace("export function", "function");

function runtime() {
  return vm.runInNewContext(`${lock}\n${helper}\n({ deviceGenerate, withEngine })`, { assertGenerationActive, Promise });
}
// Ten tokens, one per step, each step a macrotask so a stop can land between steps.
function fakeEngine({ onStep = () => {} } = {}) {
  const engine = { calls: 0, steps: 0, signals: [] };
  engine.generate = async (ids, { signal, onToken, maxNew }) => {
    engine.calls++; engine.signals.push(signal);
    const out = [];
    while (out.length < Math.min(maxNew, 10) && !(signal && signal.aborted)) {
      await new Promise((r) => setTimeout(r, 1));
      out.push(out.length); engine.steps++;
      onToken({ text: out.join(","), outIds: out.slice() });
      onStep(out.length);
    }
    return { text: out.join(","), outIds: out, ids: ids.concat(out), error: null };
  };
  return engine;
}
const cancelled = (error) => error.code === "generationCancelled";

test("an unstopped device turn streams every token and returns the engine's answer", async () => {
  const { deviceGenerate } = runtime();
  const engine = fakeEngine(), seen = [], controller = new AbortController();
  const res = await deviceGenerate(engine, [1, 2], { maxNew: 4, repPenalty: 1, signal: controller.signal, onToken: ({ text }) => seen.push(text) });
  assert.equal(res.text, "0,1,2,3");
  assert.deepEqual(seen, ["0", "0,1", "0,1,2", "0,1,2,3"]);
  assert.equal(engine.signals[0], controller.signal);
});

test("a stop during a device turn ends it at the engine's next step, shows nothing after, and frees the engine", async () => {
  const { deviceGenerate, withEngine } = runtime();
  const controller = new AbortController(), seen = [];
  const engine = fakeEngine({ onStep: (n) => { if (n === 3) controller.abort(); } });
  await assert.rejects(deviceGenerate(engine, [1], { maxNew: 900, signal: controller.signal, onToken: ({ text }) => seen.push(text) }), cancelled);
  // The stop came after the third token was shown; the engine ran no step after it.
  assert.equal(engine.steps, 3);
  assert.deepEqual(seen, ["0", "0,1", "0,1,2"]);
  assert.equal(await withEngine(async () => "next turn"), "next turn");
});

test("a turn stopped while it waits for the engine never starts", async () => {
  const { deviceGenerate, withEngine } = runtime();
  let release;
  const busy = withEngine(() => new Promise((r) => { release = r; }));
  await new Promise((r) => setTimeout(r, 0));
  const controller = new AbortController(), engine = fakeEngine();
  const waiting = deviceGenerate(engine, [1], { maxNew: 900, signal: controller.signal, onToken: () => {} });
  controller.abort();
  release();
  await busy;
  await assert.rejects(waiting, cancelled);
  assert.equal(engine.calls, 0);
});

test("the device branch of a turn goes through deviceGenerate with the turn's own signal", () => {
  const device = block(host, "if (!engine.rules) await enqueueText(", "provenance = { receipt: await sealAnswer(");
  assert.match(device, /await deviceGenerate\(inst, ids, \{[^}]*signal: abort\.signal/);
  // Nothing in the host calls the engine directly, so no device turn can bypass the stop.
  assert.equal(host.split("inst.generate(").length, 2);
  assert.ok(helper.includes("inst.generate("));
  // The stop is checked after the engine returns, before the answer is shown, remembered or sealed.
  assert.ok(device.indexOf("await deviceGenerate(") < device.indexOf("rememberSession("));
  assert.ok(device.indexOf("await deviceGenerate(") < device.indexOf("buildReceipt("));
});
