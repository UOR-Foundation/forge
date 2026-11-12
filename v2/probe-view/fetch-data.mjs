// Development only: asks the hosted LexLean service for the data form (lexlean/semantic-module/2)
// of every module under src/, and writes data/<path>.json. The sources are stored there unlisted.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
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
const t0 = Date.now();
const draft = await call("lexlean_draft_write", { profile: "prism-app", files });
console.log("draft", draft.draft, draft.files, "files", draft.bytes, "bytes");
let total = 0;
for (const f of files) {
  const out = await call("lexlean_draft_read", { draft: draft.draft, path: f.path, view: "data" });
  const target = join(root, "data", f.path.replace(/^src\//, "").replace(/\.lex\.tex$/, ".json"));
  mkdirSync(dirname(target), { recursive: true });
  const text = JSON.stringify(out.data) + "\n"; total += text.length;
  writeFileSync(target, text);
  console.log(f.path, out.data.spec, out.data.declarations.length, "declarations", text.length, "bytes");
}
console.log("total", total, "bytes in", Date.now() - t0, "ms");
