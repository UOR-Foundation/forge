// Plants one defect at a time in the code the gate runs, runs `node --test test.mjs`, restores the file and checks
// it is byte for byte what it was. Writes evidence/defects.json.   node defects.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const here = new URL(".", import.meta.url);
const defects = [
  { name: "the tab stops binding definitions: no defining equations are declared", file: "bind.mjs",
    from: "for (const e of ob.equations) declare(", to: "for (const e of []) declare(" },
  { name: "a record is admitted under any key", file: "records.mjs",
    from: 'if (record.key !== key) return "SP_KEY";', to: "" },
  { name: "the axioms observed need not equal the declared ones", file: "bind.mjs",
    from: "if (JSON.stringify(seen) !== JSON.stringify([...row.declared].sort())) return refuse(", to: "if (false) return refuse(" },
  { name: "the tab's statement is replaced by the bundle's own: the binding proves whatever the bundle states", file: "bind.mjs",
    from: "declare(`Serverless.bind.${t.lean}`, t.stmt,", to: "declare(`Serverless.bind.${t.lean}`, inTab ? t.stmt : { raw: given.record.type }," },
];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const run = () => {
  try { return { code: 0, out: execFileSync(process.execPath, ["--test", "test.mjs"], { cwd: here, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) }; }
};
const results = [];
for (const d of defects) {
  const edits = [d, ...(d.extra ? [d.extra] : [])].map((e) => ({ ...e, path: new URL(e.file, here), before: readFileSync(new URL(e.file, here)) }));
  for (const e of edits) {
    const text = e.before.toString("utf8");
    if (!text.includes(e.from)) throw new Error(`${d.name}: the text to change is not in ${e.file}`);
    writeFileSync(e.path, text.replace(e.from, e.to));
  }
  const r = run();
  for (const e of edits) writeFileSync(e.path, e.before);
  const restored = edits.every((e) => sha(readFileSync(e.path)) === sha(e.before));
  const failed = [...r.out.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]);
  results.push({ defect: d.name, exit: r.code, failed, restored });
  console.log(d.name, "| exit", r.code, "| failed:", failed.join("; ") || "none", "| restored", restored);
}
const after = run();
results.push({ after: "all restored", exit: after.code, pass: (after.out.match(/^# pass (\d+)/m) || [])[1] });
console.log("after restore: exit", after.code, "pass", results.at(-1).pass);
writeFileSync(new URL("evidence/defects.json", here), JSON.stringify(results, null, 1) + "\n");
