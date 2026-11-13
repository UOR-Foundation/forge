// Development only: writes the spec as a draft on the hosted LexLean service and runs check, or verify and waits.
//   node hosted.mjs check|verify
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = new URL("./spec/src/", import.meta.url);
const files = readdirSync(root).filter((n) => n.endsWith(".lex.tex")).sort().map((n) => ({ path: "src/" + n, content: readFileSync(new URL(n, root), "utf8") }));
let id = 0;
async function call(name, args) {
  const res = await fetch("https://mcp.uor.foundation/", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
  const body = await res.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  const r = body.result;
  return { error: !!r.isError, value: r.structuredContent ?? (() => { try { return JSON.parse(r.content[0].text); } catch { return r.content?.[0]?.text; } })() };
}
const draft = await call("lexlean_draft_write", { profile: "spec", files });
console.log("draft", draft.value.draft);
const mode = process.argv[2] ?? "check";
const c = await call("lexlean_check", { project: draft.value.draft, all: true });
const text = JSON.stringify(c.value);
console.log("check", c.error ? "REFUSED" : "ok", text.slice(0, 3000));
if (mode === "verify" && !c.error) {
  let t = await call("lexlean_verify", { project: draft.value.draft });
  console.log("verify", JSON.stringify(t.value).slice(0, 300));
  const task = t.value.task ?? t.value.id;
  for (;;) {
    await new Promise((r) => setTimeout(r, 15000));
    const s = await call("lexlean_verify_control", { task, action: "status" });
    const st = JSON.stringify(s.value);
    console.log(new Date().toISOString(), st.slice(0, 400));
    if (!/running|queued|pending/i.test(s.value?.state ?? s.value?.status ?? "")) { console.log(st.slice(0, 6000)); break; }
  }
}
