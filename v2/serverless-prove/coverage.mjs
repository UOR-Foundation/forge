// What share of real specs' theorems the tab can state (emit.mjs), and what share it can also prove itself (the
// reflexivity form, closed by Eq.refl). Proof forms are counted in the sources; statements are tried on every data
// form available here. Writes evidence/coverage.json.   node coverage.mjs
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { obligations } from "./emit.mjs";

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const v2 = join(here, "..");
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

// 1. Proof forms in the sources the task names.
const roots = ["hosted-check/corpus", "probe-payment/src", "probe-view/src", "reuse/src", "loop/answers"];
const forms = {};
for (const r of roots) for (const f of walk(join(v2, r)).filter((p) => p.endsWith(".lex.tex"))) {
  for (const m of readFileSync(f, "utf8").matchAll(/proof: *([a-z_]+)/g)) {
    forms[r] ??= {}; forms[r][m[1]] = (forms[r][m[1]] ?? 0) + 1;
  }
}

// 2. Statements the emitter can write, on every data form available.
const sets = [
  ["guests (loop/answers/guests-3.verified)", join(here, "corpus/guests/data"), "PrismTextRequest"],
  ["payment (probe-payment)", join(here, "corpus/payment/data"), "PrismTextRequest"],
  ["reuse", join(v2, "reuse/data"), "Reuse"],
];
if (existsSync(join(v2, "probe-view/data"))) sets.push(["probe-view", join(v2, "probe-view/data"), "PrismView"]);
const statements = [];
for (const [name, dir, prefix] of sets) {
  const files = walk(dir).filter((p) => p.endsWith(".json") && !/(modules|source)\.json$/.test(p));
  const modules = Object.fromEntries(files.map((p) => [p.slice(dir.length + 1, -5).replaceAll("\\", "/").replaceAll("/", "."), JSON.parse(readFileSync(p))]).filter(([, d]) => Array.isArray(d.declarations)));
  const ob = obligations({ prefix, modules });
  const reasons = {};
  for (const r of ob.refused) { const k = r.reason.replace(/^\S+: /, ""); reasons[k] = (reasons[k] ?? 0) + 1; }
  const all = Object.values(modules).flatMap((d) => d.declarations.filter((x) => x.kind === "theorem"));
  statements.push({ set: name, theorems: all.length, stated: ob.theorems.length, reflexivity: ob.theorems.filter((t) => t.proof === "reflexivity").length,
    definitionsReached: ob.definitions.length, equations: ob.equations.length, definitionsRefused: ob.refused.filter((r) => r.definition).length, reasons });
}
const out = { forms, statements };
writeFileSync(join(here, "evidence/coverage.json"), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out, null, 1));
