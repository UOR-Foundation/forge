// Loads the reuse model's data form and gives the adapters the values it speaks: Nat as BigInt,
// List as cons cells, Option as a constructor. Nothing here decides anything.
import { loadProject, NIL, cons, toArray } from "../../shell/interp.mjs";
import { blake3 } from "../../../studio/shell/prism-code/src/blake3.mjs";

export { NIL, cons, toArray };

export class ReuseError extends Error {
  constructor(code, message) { super(message ?? code); this.code = code; }
}

export const list = (items) => items.reduceRight((tail, head) => cons(head, tail), NIL);
export const none = { c: "Option.none", a: [] };
export const some = (value) => ({ c: "Option.some", a: [value] });

// A digest read as one natural number, big-endian, so the model compares addresses as numbers.
export const digestToNat = (bytes) => { let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b); return n; };
export const natToHex = (n) => n.toString(16).padStart(64, "0");
export const hexToNat = (hex) => {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new ReuseError("reuse.address", "not a 64-digit lower-case address: " + hex);
  return BigInt("0x" + hex);
};

// The model owns every preimage; this is the only place a preimage becomes an address.
export const addressOf = (preimage) => digestToNat(blake3(preimage));

// `readText(name)` returns the text of data/<name>; Node and the browser supply their own.
export async function loadModel(readText) {
  const names = JSON.parse(await readText("modules.json"));
  const modules = {};
  for (const name of names) modules[name] = JSON.parse(await readText(name + ".json"));
  const project = loadProject(modules);
  if (project.missingPrimitives.length) throw new ReuseError("reuse.model", "interpreter lacks " + project.missingPrimitives.join(", "));
  return project;
}

export async function loadModelNode(dir = new URL("../data/", import.meta.url)) {
  const { readFile } = await import("node:fs/promises");
  return loadModel((name) => readFile(new URL(name, dir), "utf8"));
}
