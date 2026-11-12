// Development only: asks the hosted LexLean service for the data form (lexlean/semantic-module/2)
// of every module under <srcRoot>/src and writes it under <outDir>, with a modules.json list.
// The sources are stored there unlisted: not searchable, readable by anyone with the draft's ID.
// Run: node fetch.mjs <project dir holding src/> <out dir> [profile]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

const [projectArg, outArg, profile = "prism-app"] = process.argv.slice(2);
if (!projectArg || !outArg) { console.error("usage: node fetch.mjs <project dir> <out dir> [profile]"); process.exit(64); }
const project = resolve(projectArg), out = resolve(outArg);
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".lex.tex") ? [p] : []; });
const files = walk(join(project, "src")).map((p) => ({ path: relative(project, p).split("\\").join("/"), content: readFileSync(p, "utf8") }));
let id = 0;
async function call(name, args) {
  const res = await fetch("https://mcp.uor.foundation/", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
  const body = await res.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  if (body.result.isError) throw new Error(body.result.content?.[0]?.text?.slice(0, 600));
  return body.result.structuredContent ?? JSON.parse(body.result.content[0].text);
}
const draft = await call("lexlean_draft_write", { profile, files });
const names = [];
for (const f of files) {
  const read = await call("lexlean_draft_read", { draft: draft.draft, path: f.path, view: "data" });
  const stem = f.path.replace(/^src\//, "").replace(/\.lex\.tex$/, "");
  const target = join(out, stem + ".json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(read.data) + "\n");
  names.push(stem.split("/").join("."));
}
writeFileSync(join(out, "modules.json"), JSON.stringify(names) + "\n");
writeFileSync(join(out, "source.json"), JSON.stringify({ draft: draft.draft, profile, files: files.map((f) => f.path) }, null, 1) + "\n");
console.log(draft.draft, names.length, "modules");
