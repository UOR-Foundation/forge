// Proof objects by address. A proof object is a small record that says: the bundle with these bytes proves the
// theorem whose key is this. The key is computed by the tab from the spec, never read from the record:
//
//   key = sha256( "prism/serverless-prove/key/1\n" ‖ framed(toolchain) ‖ framed(declaration) ‖ framed(closure...) )
//
//   toolchain    Lean's commit, the pinned library's address, the checker's address, the emitter's version
//   declaration  the theorem as LexLean's data form writes it: statement, proof form, axioms
//   closure      every definition and type the statement reaches, in the data form, ordered by name
//
// So an edit re-keys exactly the theorems whose declaration or closure it touched (incremental proving by address),
// and a record filed under any other key, for any other toolchain, or naming other bytes, is not used.
// Every field is framed by an 8-byte big-endian length and every preimage starts with a tag, as v2/reuse does.

import { obligations } from "./emit.mjs";

const te = new TextEncoder();

export async function sha256(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return "sha256:" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function framed(parts) {
  const chunks = [];
  for (const p of parts) {
    const b = typeof p === "string" ? te.encode(p) : p;
    const len = new Uint8Array(8);
    new DataView(len.buffer).setBigUint64(0, BigInt(b.length));
    chunks.push(len, b);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

const canonical = (x) => JSON.stringify(sort(x));
function sort(x) {
  if (Array.isArray(x)) return x.map(sort);
  if (!x || typeof x !== "object") return x;
  return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])]));
}

export function toolchainPreimage(t) {
  return framed(["prism/serverless-prove/toolchain/1\n", t.lean, t.library, t.checker, t.emitter]);
}

// The key of one theorem of the spec.
export async function keyOf(spec, theoremLean, toolchainAddress) {
  const ob = obligations(spec, [theoremLean]);
  const decl = (lean) => {
    for (const [mod, data] of Object.entries(spec.modules)) for (const d of data.declarations) if (`${spec.prefix}.${mod}.${d.name}` === lean) return d;
    throw new Error(`${lean} is not in the spec`);
  };
  const closure = [...ob.definitions, ...ob.types].sort().flatMap((n) => [n, canonical(decl(n))]);
  return sha256(framed(["prism/serverless-prove/key/1\n", toolchainAddress, theoremLean, canonical(decl(theoremLean)), ...closure]));
}

export function recordPreimage(r) {
  return framed(["prism/serverless-prove/record/1\n", r.key, r.theorem, r.bundle]);
}

// Admit a record for a key the tab computed: the record must name that key and that theorem, and the bytes fetched
// for it must hash to the address it names. Returns the reason for a refusal, or null.
export async function admit({ key, theorem }, record, bundleBytes) {
  if (!record) return "SP_NO_RECORD";
  if (record.key !== key) return "SP_KEY";
  if (record.theorem !== theorem) return "SP_THEOREM";
  if (!bundleBytes) return "SP_NO_BUNDLE";
  if ((await sha256(bundleBytes)) !== record.bundle) return "SP_BUNDLE_ADDRESS";
  return null;
}
