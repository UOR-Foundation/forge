// Development only: asks the hosted LexLean service for the data form (lexlean/semantic-module/2) of every module of
// a corpus project, as v2/probe-view/fetch-data.mjs does. In the product the tab computes the same data form itself
// with LexLean's own check compiled to WebAssembly (v2/in-tab-check, equal to the hosted form on payment).
//   node fetch-data.mjs corpus/guests
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

const root = resolve(process.argv[2]);
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".lex.tex") ? [p] : []; });
const files = walk(join(root, "src")).map((p) => ({ path: relative(root, p).replaceAll("\\", "/"), content: readFileSync(p, "utf8") }));
let id = 0;
async function call(name, args) {
  const res = await fetch("https://mcp.uor.foundation/", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
  const body = await res.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  const r = body.result;
  if (r.isError) throw new Error(r.content?.[0]?.text?.slice(0, 600));
  return r.structuredContent ?? JSON.parse(r.content[0].text);
}
const draft = await call("lexlean_draft_write", { profile: process.argv[3] ?? "prism-app", files });
console.log("draft", draft.draft);
const modules = [];
for (const f of files) {
  const out = await call("lexlean_draft_read", { draft: draft.draft, path: f.path, view: "data" });
  const module = f.path.replace(/^src\//, "").replace(/\.lex\.tex$/, "").replaceAll("/", ".");
  const target = join(root, "data", module + ".json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(out.data) + "\n");
  modules.push(module);
  console.log(f.path, out.data.declarations.length, "declarations");
}
writeFileSync(join(root, "data", "source.json"), JSON.stringify({ draft: draft.draft, modules: modules.sort() }, null, 1) + "\n");
