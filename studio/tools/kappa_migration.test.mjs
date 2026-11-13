import assert from "node:assert/strict";
import test from "node:test";
import { kappa } from "../shell/address.mjs";
import { readdress, rewrite } from "../shell/kappa-migration.mjs";

const enc = new TextEncoder(), dec = new TextDecoder();
const legacy = (n) => "blake3:" + n.toString(16).padStart(64, "0");
// The core's snapshotPreimage spelling (studio/src/Workspace.lex.tex) for plain names and paths.
const spell = (project, parent) => JSON.stringify({ entries: project.entries.map((e) => [e.path, e.kappa, e.bytes]), name: project.label, parent });

test("a store moves to κ: every object by its bytes, every snapshot spelled again with its files and parent", () => {
  const a = enc.encode("a"), b = enc.encode("bb");
  const first = enc.encode(JSON.stringify({ entries: [["a.txt", legacy(1), 1]], name: "app", parent: "" }));
  const second = enc.encode(JSON.stringify({ entries: [["a.txt", legacy(1), 1], ["b.txt", legacy(2), 2]], name: "app", parent: legacy(3) }));
  const { objects, map } = readdress(new Map([[legacy(4), second], [legacy(3), first], [legacy(1), a], [legacy(2), b]]), { derive: kappa, spell });
  assert.equal(map.get(legacy(1)), kappa(a));
  assert.equal(map.get(legacy(2)), kappa(b));
  const head = JSON.parse(dec.decode(objects.get(map.get(legacy(4)))));
  assert.deepEqual(head, { entries: [["a.txt", kappa(a), 1], ["b.txt", kappa(b), 2]], name: "app", parent: map.get(legacy(3)) });
  for (const [key, bytes] of objects) assert.equal(kappa(bytes), key, "every object derives to its address");
  assert.equal(objects.size, 4);
});

test("a snapshot naming a file the store never held is left out, and what names it is stale", () => {
  const broken = enc.encode(JSON.stringify({ entries: [["a.txt", legacy(9), 1]], name: "app", parent: "" }));
  const { objects, map } = readdress(new Map([[legacy(5), broken]]), { derive: kappa, spell });
  assert.equal(objects.size, 0);
  assert.equal(map.has(legacy(5)), false);
  assert.deepEqual(rewrite({ main: legacy(5) }, map), { value: { main: legacy(5) }, stale: true });
});

test("records keep what maps and say when an identity they cache does not", () => {
  const map = new Map([[legacy(1), "sha256:" + "1".repeat(64)]]);
  assert.deepEqual(rewrite([{ oid: legacy(1), message: "m" }], map), { value: [{ oid: "sha256:" + "1".repeat(64), message: "m" }], stale: false });
  assert.equal(rewrite({ state: { sourceKappa: legacy(7) } }, map).stale, true);
  assert.equal(rewrite({ name: "plain" }, map).stale, false);
});
