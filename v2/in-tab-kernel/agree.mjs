// Compares every checker's verdict on every input and writes evidence/agreement.json. Exits 1 on any disagreement.
//   node agree.mjs
// Sources: evidence/native.json (this driver, native, Lean 4.32.1), evidence/wasm.json (the same as WebAssembly, whole
// and resident), ../serverless-prove/evidence/lean-kernel.json (the arena's official checker with all of Lean, 4.32.1),
// ../serverless-prove/evidence/agreement.json (nanoda in the tab, where it lists the input).
import fs from "node:fs";
const here = new URL(".", import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, here), "utf8"));
const native = read("evidence/native.json"), wasm = read("evidence/wasm.json"), official = read("../serverless-prove/evidence/lean-kernel.json");
let nanoda = {};
try {
  const walk = (v) => { if (v && typeof v === "object") { if (typeof v.sha256 === "string" && typeof v.accepted === "boolean") nanoda[v.sha256] = v.accepted; for (const k of Object.values(v)) walk(k); } };
  walk(read("../serverless-prove/evidence/agreement.json"));
} catch {}
const rows = [];
let bad = 0;
for (const sha of Object.keys(official).sort()) {
  const v = { official: official[sha].accepted, native: native[sha]?.accepted, wasmWhole: wasm.whole[sha]?.accepted, wasmResident: wasm.resident.inputs[sha]?.accepted };
  if (sha in nanoda) v.nanoda = nanoda[sha];
  const agree = new Set(Object.values(v)).size === 1 && !Object.values(v).includes(undefined);
  if (!agree) bad++;
  rows.push({ sha256: sha, ...v, agree });
  console.log(sha.slice(0, 12), JSON.stringify(v), agree ? "agree" : "DISAGREE");
}
const summary = { inputs: rows.length, accepted: rows.filter((r) => r.official).length, refused: rows.filter((r) => !r.official).length, disagreements: bad, nanodaCompared: rows.filter((r) => "nanoda" in r).length };
fs.writeFileSync(new URL("evidence/agreement.json", here), JSON.stringify({ summary, checker: wasm.checker, library: wasm.library, rows }, null, 1) + "\n");
console.log(JSON.stringify(summary));
process.exit(bad ? 1 : 0);
