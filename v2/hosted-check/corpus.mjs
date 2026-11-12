// The corpus as cases: each directory under corpus/ holding .lex.tex files is one project. The spec is App or Payment;
// any other file in the directory is an extra module of the author's.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "corpus");

export function cases() {
  const out = [];
  const walk = (rel) => {
    const entries = readdirSync(join(root, rel), { withFileTypes: true });
    const files = entries.filter((e) => e.isFile() && e.name.endsWith(".lex.tex")).map((e) => e.name).sort();
    if (files.length) {
      const spec = files.find((f) => f === "App.lex.tex" || f === "Payment.lex.tex");
      const read = (f) => readFileSync(join(root, rel, f), "utf8");
      out.push({ id: rel, files, spec: read(spec), extras: files.filter((f) => f !== spec).map(read) });
    }
    for (const e of entries) if (e.isDirectory()) walk(rel ? `${rel}/${e.name}` : e.name);
  };
  walk("");
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
