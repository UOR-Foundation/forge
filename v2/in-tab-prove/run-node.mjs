// Development: check exports in Node and print one line each.   node run-node.mjs <export> [...]
import { readFileSync } from "node:fs";
import { load, check } from "./kernel.mjs";
const checker = await load(readFileSync(new URL("./dist/kernel-tab.wasm", import.meta.url)));
for (const file of process.argv.slice(2)) {
  const bytes = readFileSync(file);
  const t = performance.now();
  const r = check(checker, bytes, { permitted_axioms: ["propext", "Quot.sound", "Classical.choice"] });
  console.log(file, bytes.length, (performance.now() - t).toFixed(1) + " ms", r.ok, r.declarations, r.theorems?.length, JSON.stringify(r.axioms_in_environment), r.memory_bytes, (r.refusal || "").slice(0, 700));
}
