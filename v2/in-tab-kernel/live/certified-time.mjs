// Writes a Lean file that has Lean's kernel judge Verdant one guarantee at a time with live/Certified.lean's check,
// to time it beside the check as it is. A measurement: the file is not part of any proof used elsewhere.
//   node live/certified-time.mjs <VerdantRegions.lean> <out.lean>
import fs from "node:fs";
import { certsOf } from "./certs.mjs";

const [leanPath, out] = process.argv.slice(2);
const lean = fs.readFileSync(leanPath, "utf8");
const block = (name) => new RegExp(`def ${name} : [^\\n]* := \\[([\\s\\S]*?)\\]\\n\\n`).exec(lean)[1];
const conds = (s) => [...s.matchAll(/⟨(\d+), (\d+), (\d+)⟩/g)].map((m) => m.slice(1).map(Number));
const app = {
  rules: [...block("rules").matchAll(/⟨\[(.*?)\], (\d+)⟩/g)].map((m) => ({ when: conds(m[1]), outcome: Number(m[2]) })),
  properties: [...block("props").matchAll(/⟨(true|false), \[(.*?)\], (\d+)⟩/g)].map((m) => ({ always: m[1] === "true", when: conds(m[2]), outcome: Number(m[3]) })),
  bounds: [.../def B : Box := \[(.*)\]/.exec(lean)[1].matchAll(/\((\d+), (\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]),
  otherwise: Number(/def d : Nat := (\d+)/.exec(lean)[1]),
};
const certs = certsOf(app);
const cert = (sel) => `([${sel.join(", ")}], none)`;
const cond = ([f, o, v]) => `⟨${f}, ${o}, ${v}⟩`;
fs.writeFileSync(out, `import PrismLive.VerdantRegions
import PrismLive.Certified
open PrismLive.Kernel VerdantR

${app.properties.map((p, i) => `theorem g${i} : certCheck B rules [] d ⟨${p.always}, [${p.when.map(cond).join(", ")}], ${p.outcome}⟩
    [${certs[i].rules.map(cert).join(", ")}] ${cert(certs[i].other)} = true := by decide +kernel`).join("\n\n")}

#print axioms PrismLive.Kernel.certCheck_sound
`);
console.log(JSON.stringify({ guarantees: certs.length, facts: certs.reduce((n, c) => n + c.facts.length, 0), named: certs.reduce((n, c) => n + c.rules.reduce((k, s) => k + s.length, 0) + c.other.length, 0) }));
