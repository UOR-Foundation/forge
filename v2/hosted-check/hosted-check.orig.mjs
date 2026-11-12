// Checks a spec on the hosted LexLean service, with no local toolchain. Runs in Node and in a browser tab.
//
// The hosted profile lacks the lexicon entries the library's titles use, so it refuses the library
// as shipped (LLL1004). A title is a label, not a declaration, so for checking only, each module is
// sent with its title replaced by one the hosted lexicon holds. The declarations are sent unchanged.
// This is a stand-in until the hosted profile carries the library; proving still uses the real files.
const ENDPOINT = "https://mcp.uor.foundation/";
const HOSTED_TITLE = "Text application model";
export const retitle = (source) => source.replace(/\title\{[^}]*\}/, `\title{${HOSTED_TITLE}}`);

let id = 0;
async function call(name, args) {
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? JSON.stringify(body.error));
  const payload = body.result.structuredContent ?? JSON.parse(body.result.content[0].text);
  return { payload, refused: !!body.result.isError };
}

// `library`: [{ path, content }] for the modules the spec imports. `app`: the spec's source.
// Returns { ok, diagnostics, data, ms: { write, check, data } }; `data` is the spec's data form when it checked.
export async function hostedCheck(app, library, path = "src/App.lex.tex") {
  const now = () => performance.now(), ms = {};
  let t = now();
  const files = [...library.map((f) => ({ path: f.path, content: retitle(f.content) })), { path, content: retitle(app) }];
  const draft = (await call("lexlean_draft_write", { profile: "prism-app", files })).payload.draft;
  ms.write = Math.round(now() - t); t = now();
  const checked = (await call("lexlean_check", { project: draft, all: true })).payload;
  ms.check = Math.round(now() - t);
  const diagnostics = (checked.diagnostics ?? []).map((d) => ({ code: d.code, message: d.message, path: d.primary?.path, line: d.primary?.line_start, column: d.primary?.column_start }));
  if (!checked.success) return { ok: false, diagnostics, draft, ms };
  t = now();
  const data = (await call("lexlean_draft_read", { draft, path, view: "data" })).payload.data;
  ms.data = Math.round(now() - t);
  return { ok: true, diagnostics, data, draft, ms };
}
