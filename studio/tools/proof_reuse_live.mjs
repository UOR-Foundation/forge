// FA-85 against the real hosted verifier (https://mcp.uor.foundation/), not part of the gate: it sends
// the fixture's files (unlisted, not private) and takes minutes. It proves a decision app cold, again
// unchanged, and again with one guarantee edited, with one in-memory store, and prints what each run
// cost and what it reused.
//   node tools/proof_reuse_live.mjs
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as prism from "../shell/prism.js";
import { names } from "../shell/prism/render.mjs";

const RAW = {
  purpose: "Parking fee: decide the fee tier for one stay.", title: "Parking Fee",
  fields: [{ name: "hours", kind: "number", min: 0, max: 24 }, { name: "vehicle", kind: "choice", values: ["car", "motorcycle", "truck"] }],
  outcomes: ["free", "standard", "premium"],
  rules: [{ when: [{ field: "hours", op: "=", value: 0 }], then: "free" }, { when: [{ field: "vehicle", op: "is", value: "truck" }], then: "premium" }, { when: [{ field: "hours", op: ">", value: 12 }], then: "premium" }],
  otherwise: "standard",
  properties: [
    { kind: "never", when: [{ field: "hours", op: "=", value: 0 }], then: "premium" },
    { kind: "never", when: [{ field: "vehicle", op: "is", value: "car" }, { field: "hours", op: "<", value: 5 }], then: "premium" },
    { kind: "always", when: [{ field: "vehicle", op: "is", value: "truck" }, { field: "hours", op: ">", value: 0 }], then: "premium" },
  ],
  examples: [],
};
const specOf = (raw) => { const r = prism.checkSpec(structuredClone(raw)); if (!r.ok) throw new Error(r.issues.join("; ")); return r.spec; };
const m = new Map();
const store = { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, structuredClone(v)); } };

// Count what reaches the verifier, by tool.
const calls = {};
const real = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  // The shell reads its library modules beside itself; Node's fetch has no file: scheme.
  if (String(url).startsWith("file:")) return new Response(fs.readFileSync(fileURLToPath(url), "utf8"));
  if (init && init.body && String(url).startsWith("https://")) { try { const b = JSON.parse(init.body); const n = b.params?.name || b.method; calls[n] = (calls[n] || 0) + 1; } catch {} }
  return real(url, init);
};
async function step(label, spec) {
  for (const k of Object.keys(calls)) delete calls[k];
  const t0 = Date.now();
  const r = await prism.prove(spec, { store });
  const ms = Date.now() - t0;
  const sent = r.ok ? (r.record.theorems || []).filter((t) => !t.reused).map((t) => t.theorem.split("#")[1]) : [];
  console.log(JSON.stringify({ label, ok: r.ok, error: r.error || null, ms, reused: r.ok ? r.record.reused : null, proved: r.ok ? r.record.proved : null, sent, attestation: r.ok ? r.record.attestation_id : null, refusals: r.ok ? r.record.theorems.map((t) => t.refusal) : null, calls: { ...calls } }));
  return r;
}
await step("cold", specOf(RAW));
await step("unchanged", specOf(RAW));
const edited = structuredClone(RAW); edited.properties[1].when[1].value = 4;
const spec = specOf(edited);
console.log("edited theorem:", names(spec).properties[spec.properties[1].id].theorem);
await step("one guarantee edited", spec);
