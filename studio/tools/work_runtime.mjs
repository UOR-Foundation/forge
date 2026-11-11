// Independent execution of the signed SDK artifact; never a compiler substitute.
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadArchive } from "../../try/vendor/prism-code/src/index.mjs";
import { executeWorkWithGuest } from "../shell/work-codec.mjs";
if (process.argv.length !== 3) throw Error("usage: work_runtime.mjs ARCHIVE.holo");
const app = await loadArchive(new Uint8Array(fs.readFileSync(process.argv[2])));
const acceptance = await app.acceptance();
assert.ok(acceptance.total >= 109); assert.equal(acceptance.passed, acceptance.total); assert.equal(acceptance.failed.length, 0);
const vectors = JSON.parse(fs.readFileSync(new URL("../../verification/work-wire-vectors.json", import.meta.url))).vectors;
assert.equal(vectors.length, 30);
for (const vector of vectors) assert.equal(new TextDecoder().decode(await app.dispatch(new TextEncoder().encode(vector.request))), vector.response, vector.name);
const result = await executeWorkWithGuest(app, { kind: "initialize", owner: 7, capacity: 20, remaining: 2 });
assert.deepEqual(result, { ok: true, state: { owner: 7, revision: 0, capacity: 20, spent: 0, reserved: 0, checkpoint: 0, remaining: 2, phase: 0 } });
console.log(JSON.stringify({ archiveFingerprint: app.identities.archiveFingerprint, embedded: acceptance.total, workVectors: vectors.length, adapter: "passed" }));
