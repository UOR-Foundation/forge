// Mechanism 1: address every declaration, then ask the model which ones must be checked again.
// The adapter orders the work (dependencies first) and hashes; the model writes every preimage
// and makes every staleness decision.
import { addressOf, list, toArray, none, some, ReuseError } from "./model.mjs";

const A = "Address::";
const enc = new TextEncoder();
const bytes = (v) => (v instanceof Uint8Array ? v : enc.encode(v));

export function toolchainId(model, { semantics, lean, lexicons }) {
  return addressOf(model.call(A + "toolchainPreimage", { semantics: bytes(semantics), lean: bytes(lean), lexicons: bytes(lexicons) }));
}

// declarations: [{ name, kind, body, dependsOn: [name] }]. Returns Map name -> { key, address }.
export function addressDeclarations(model, toolchain, declarations) {
  const byName = new Map(declarations.map((d) => [d.name, d]));
  if (byName.size !== declarations.length) throw new ReuseError("reuse.duplicateName");
  const out = new Map(), visiting = new Set();
  const visit = (name) => {
    if (out.has(name)) return out.get(name);
    const d = byName.get(name);
    if (!d) throw new ReuseError("reuse.unknownDependency", name);
    if (visiting.has(name)) throw new ReuseError("reuse.cycle", name);
    visiting.add(name);
    const dependencies = [...new Set(d.dependsOn ?? [])].map((n) => visit(n).address);
    visiting.delete(name);
    const depList = list(dependencies);
    if (!model.call(A + "dependenciesValid", depList)) throw new ReuseError("reuse.duplicateDependency", name);
    const own = addressOf(model.call(A + "ownPreimage", { kind: BigInt(d.kind), name: bytes(d.name), body: bytes(d.body), dependencies: depList }));
    const key = { toolchain, own, dependencies: addressOf(model.call(A + "dependenciesPreimage", depList)) };
    const entry = { key, address: addressOf(model.call(A + "keyPreimage", key)) };
    out.set(name, entry);
    return entry;
  };
  for (const d of declarations) visit(d.name);
  return out;
}

const STALENESS = { "Address::Staleness.fresh": "fresh", "Address::Staleness.toolchainChanged": "toolchainChanged", "Address::Staleness.ownChanged": "ownChanged", "Address::Staleness.dependencyChanged": "dependencyChanged", "Address::Staleness.added": "added" };

// previous: Map name -> { key } from the last run (or empty). Returns the names the model says
// must be checked or proved again, in declaration order, and the reason for each declaration.
export function plan(model, previous, current) {
  const names = [...current.keys()];
  const changes = names.map((name, i) => ({ index: BigInt(i), previous: previous.has(name) ? some(previous.get(name).key) : none, current: current.get(name).key }));
  const recheck = toArray(model.call(A + "recheck", list(changes))).map((i) => names[Number(i)]);
  const reasons = new Map(changes.map((c, i) => [names[i], STALENESS[model.call(A + "staleness", c).c]]));
  return { recheck, reasons };
}
