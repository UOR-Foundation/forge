// Development: sets a theorem's declared axioms to what Lean observed, from LLV7005 diagnostics in a verify result.
//   node fix-axioms.mjs spec/evidence/verify.json
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const v = JSON.parse(readFileSync(process.argv[2]));
let changed = 0;
for (const d of v.diagnostics.filter((x) => x.code === "LLV7005")) {
  const m = d.message.match(/`ServerlessProve\.(\w+)\.(\w+)` violates its \w+ axiom policy: observed \[([^\]]*)\]/);
  if (!m) continue;
  const [, mod, name, observed] = m, p = `spec/src/${mod}.lex.tex`;
  let s = readFileSync(p, "utf8");
  const at = s.indexOf(`  name: ${name},\n`);
  const end = s.indexOf("\n}", at);
  const block = s.slice(at, end).replace(/axioms: \[[^\]]*\]/, `axioms: [${observed}]`);
  s = s.slice(0, at) + block + s.slice(end);
  writeFileSync(p, s); changed++;
  console.log(mod, name, observed);
}
console.log(changed, "changed");
