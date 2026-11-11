// Independent replay of a downloaded SDK-built artifact. This does not compile
// or substitute for the SDK. Use: node tools/composition_runtime.mjs ARCHIVE.holo
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadArchive } from "../../try/vendor/prism-code/src/index.mjs";
import { encodeComposition, admitWithGuest } from "../shell/composition-codec.mjs";

if (process.argv.length !== 3) throw Error("usage: composition_runtime.mjs ARCHIVE.holo");
const bytes = new Uint8Array(fs.readFileSync(process.argv[2]));
const guest = await loadArchive(bytes);
const acceptance = await guest.acceptance();
assert.ok(acceptance.total > 0);
assert.equal(acceptance.failed.length, 0);
assert.equal(acceptance.passed, acceptance.total);
const vectors = JSON.parse(fs.readFileSync(new URL("../../verification/composition-wire-vectors.json", import.meta.url)));
for (const vector of vectors) {
  const request = new Uint8Array(Buffer.from(vector.request, "hex"));
  const response = await guest.dispatch(request);
  assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(response), vector.response, vector.name);
  if (vector.policy) {
    assert.deepEqual(encodeComposition(vector.policy, vector.features), request);
    const result = await admitWithGuest(guest, vector.policy, vector.features);
    assert.equal(result.ok, vector.response === "accepted", vector.name);
    if (!result.ok) assert.equal(result.code, vector.response, vector.name);
  }
}
console.log(JSON.stringify({ stage: "corpus", vectors: vectors.length, acceptance: acceptance.total }));
// Exercise the deepest permitted byte-decoder path, not only small examples.
const maximum = new Uint8Array(32776).fill(48);
maximum.set(new TextEncoder().encode("compose "));
assert.equal(new TextDecoder().decode(await guest.dispatch(maximum)), "malformedComposition");
console.log(JSON.stringify({ archiveFingerprint: guest.identities.archiveFingerprint, acceptance: { total: acceptance.total, passed: acceptance.passed }, wireVectors: vectors.length, maximumPayload: "refused" }));
