// Development only, never shipped: writes the two LexLean sources as a draft on the public LexLean
// service (the same one v2/loop uses), reads back the toolchain's data form of each module and saves it
// under data/. Only the spec sources are sent; no telemetry record exists at build time.
// Run: node studio/telemetry/tools/data-form.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const FILES = ["src/Telemetry.lex.tex", "src/TelemetryProofs.lex.tex"];
const call = async (tool, args) => {
  const res = await fetch("https://mcp.uor.foundation/", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }) });
  const body = await res.json();
  if (body.error || body.result.isError) throw new Error((body.error?.message ?? body.result.content?.[0]?.text ?? "").slice(0, 800));
  return body.result.structuredContent ?? JSON.parse(body.result.content[0].text);
};
const files = FILES.map((path) => ({ path, content: readFileSync(new URL(path, root), "utf8") }));
const draft = await call("lexlean_draft_write", { profile: "spec", files });
const check = await call("lexlean_check", { project: draft.draft, all: true });
const out = new URL("../shell/telemetry/data/", root);
mkdirSync(out, { recursive: true });
const names = [];
for (const { path } of files) {
  const read = await call("lexlean_draft_read", { draft: draft.draft, path, view: "data" });
  const name = /src\/(\w+)\.lex\.tex/.exec(path)[1];
  names.push(name);
  writeFileSync(new URL(`${name}.json`, out), JSON.stringify(read.data) + "\n");
}
writeFileSync(new URL("modules.json", out), JSON.stringify(names) + "\n");
const sha = (t) => createHash("sha256").update(t).digest("hex");
writeFileSync(new URL("source.json", out), JSON.stringify({ draft: draft.draft, profile: "spec", checked: check.success ?? true, files: Object.fromEntries(files.map((f) => [f.path, sha(f.content)])) }, null, 1) + "\n");
console.log(draft.draft, names.join(" "));
