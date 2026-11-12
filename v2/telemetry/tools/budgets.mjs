// Development only: copies the kernel's build-journey budgets (FK, `budget JOURNEY VALUE`) into
// budgets.json, with the commit they were read from. The kernel stays the only source: once its journeys
// are on main, the adapter asks `window.__forgeKernel.ask("budget <journey> <ms>")` and this file goes.
// Run: node v2/telemetry/tools/budgets.mjs [revision]   (default: journey-gaps)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const rev = process.argv[2] ?? "journey-gaps";
const commit = execFileSync("git", ["rev-parse", rev], { encoding: "utf8" }).trim();
const source = execFileSync("git", ["show", `${commit}:app/src/ForgeKernel.lex.tex`], { encoding: "utf8", maxBuffer: 1 << 26 });
const code = Object.fromEntries([...source.matchAll(/definition\{name: journey([A-Z]\w*), parameters: \[\], result: Nat, body: (\d+)\}/g)].map((m) => [m[1][0].toLowerCase() + m[1].slice(1), Number(m[2])]));
const body = /name: budgetOf,[\s\S]*?body: (.*)\n/.exec(source)[1];
const ms = Object.fromEntries([...body.matchAll(/journey =\? (\d+)\) then (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
const JOURNEYS = ["preview", "declaration", "pixel", "update", "edit", "checked", "built"];
const budgets = Object.fromEntries(JOURNEYS.map((j) => { if (!(j in code) || !(code[j] in ms)) throw new Error("kernel has no budget for " + j); return [j, ms[code[j]]]; }));
writeFileSync(new URL("../budgets.json", import.meta.url), JSON.stringify({ source: "app/src/ForgeKernel.lex.tex budgetOf", commit, unit: "ms, within when value <= budget", budgets }, null, 1) + "\n");
console.log(commit, budgets);
