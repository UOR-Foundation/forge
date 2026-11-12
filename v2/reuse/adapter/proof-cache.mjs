// Mechanism 2: a shared proof cache. The transport is injected (no server here). The model decides
// whether a record is admitted and what the next step is; the adapter fetches, verifies the
// attestation's bytes by re-hashing them, and runs the work only when the model says so.
import { addressOf, none, some, ReuseError } from "./model.mjs";

const P = "ProofCache::";
const REFUSAL = (c) => c.slice(c.lastIndexOf(".") + 1);

// transport.get(query) -> Promise<{ address, toolchain, claim, attestation: Uint8Array | null } | null>
// transport.put(record) -> Promise<void>
// An attestation is identified by the address of its bytes; the caller verifies by re-deriving it.
export function createProofCache(model, transport) {
  const attestationAddress = (bytes) => addressOf(model.call("Store::blobPreimage", bytes));
  const toRecord = (found) => ({ address: found.address, toolchain: found.toolchain, claim: found.claim, attestation: found.attestationAddress == null ? none : some(found.attestationAddress) });

  async function obtain(query, work) {
    let step = model.call(P + "nextStep", 0n, query, none, none);
    if (step.c !== P + "Step.consult") throw new ReuseError("reuse.protocol", "model did not ask to consult first");
    const found = await transport.get(query);
    const observed = found?.attestation ? some(attestationAddress(found.attestation)) : none;
    const stored = found ? some(toRecord(found)) : none;
    step = model.call(P + "nextStep", 1n, query, stored, observed);
    const admission = found ? model.call(P + "admitRecord", query, toRecord(found), observed) : null;
    if (step.c === P + "Step.reuse") return { reused: true, attestation: found.attestation, attestationAddress: step.a[0] };
    if (step.c !== P + "Step.work") throw new ReuseError("reuse.protocol", "unexpected step " + step.c);
    const refusal = admission && admission.c === P + "Admission.refused" ? REFUSAL(admission.a[0].c) : found ? null : "absent";
    const attestation = await work();
    const address = attestationAddress(attestation);
    await transport.put({ address: query.address, toolchain: query.toolchain, claim: query.claim, attestation, attestationAddress: address });
    return { reused: false, refusal, attestation, attestationAddress: address };
  }

  // Exposed so tests can ask the model directly about a record they built.
  const admit = (query, found) => {
    const observed = found.attestation ? some(attestationAddress(found.attestation)) : none;
    const a = model.call(P + "admitRecord", query, toRecord(found), observed);
    return a.c === P + "Admission.admitted" ? { admitted: true, attestationAddress: a.a[0] } : { admitted: false, refusal: REFUSAL(a.a[0].c) };
  };
  return { obtain, admit, attestationAddress };
}

// An in-memory transport standing in for a shared HTTP gateway. It stores what it is given and
// returns it unverified: verifying is the client's job, so a dishonest server cannot help itself.
export function memoryTransport() {
  const records = new Map();
  const key = (q) => `${q.address}:${q.toolchain}:${q.claim}`;
  return {
    records,
    get: async (query) => records.get(key(query)) ?? null,
    put: async (record) => { records.set(key(record), record); },
  };
}
