// Development: bind a spec to a bundle and check it in Node with the same code the worker runs.
//   node run-node.mjs <corpus dir> <bundle.ndjson> [theorem ...]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, check } from "../in-tab-prove/kernel.mjs";
import { assemble, decide } from "./bind.mjs";

const [dir, bundlePath, ...theorems] = process.argv.slice(2);
const src = JSON.parse(readFileSync(join(dir, "data", "source.json")));
const modules = Object.fromEntries(src.modules.map((m) => [m, JSON.parse(readFileSync(join(dir, "data", m + ".json")))]));
const prefix = JSON.parse(readFileSync(join(dir, "spec.json"))).module_prefix;
const library = readFileSync(new URL("./dist/library.ndjson", import.meta.url));
const bundle = readFileSync(bundlePath);
const permitted = ["propext", "Quot.sound", "Classical.choice"];
let t = performance.now();
const a = assemble({ library, bundle, spec: { prefix, modules }, theorems: theorems.length ? theorems : undefined });
console.log("assemble", (performance.now() - t).toFixed(0), "ms", a.ok ? "" : a.code + " " + a.why);
if (!a.ok) process.exit(1);
console.log("definitions", a.obligations.definitions.length, "types", a.obligations.types.length, "equations", a.obligations.equations.length, "refused by emitter", JSON.stringify(a.refusedByEmitter), "type errors", JSON.stringify(a.typeErrors), "unbound", JSON.stringify(a.unbound));
const bytes = Buffer.concat([bundle, Buffer.from(a.appended)]);
const checker = await load(readFileSync(new URL("./dist/kernel-tab.wasm", import.meta.url)));
t = performance.now();
const r = check(checker, bytes, { admitted: a.admitted, permitted_axioms: permitted });
console.log("kernel", (performance.now() - t).toFixed(0), "ms", r.ok, r.checked, (r.refusal || "").slice(0, 1500));
for (const row of decide(a, r, permitted)) console.log(row.verdict.padEnd(15), row.theorem, row.madeInTab ? "(made in tab)" : "", row.why ?? JSON.stringify(row.axioms));
if (process.env.EACH) {
  // Development: check each emitted declaration on its own, to name the one that fails.
  const lines = a.appended.trim().split("\n");
  const tables = lines.filter((l) => !l.startsWith('{"thm"')), decls = lines.filter((l) => l.startsWith('{"thm"'));
  for (const [i, d] of decls.entries()) {
    const one = Buffer.concat([bundle, Buffer.from(tables.join("\n") + "\n" + d + "\n")]);
    const r1 = check(checker, one, { admitted: a.admitted, permitted_axioms: permitted });
    console.log(a.records[i].name, r1.ok ? "ok" : (r1.refusal || "").split("\n").slice(-1)[0].slice(0, 200));
  }
}
