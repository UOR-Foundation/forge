// Checks a spec that imports PrismPM's library on the hosted LexLean service, from a browser tab or Node.
//
// The hosted `prism-app` profile holds 2 of the SDK's 141 prism.arch title phrases, so it refuses a module whose
// \title uses another one (LLL1004). For checking only, each such phrase inside a \title is replaced by
// "Text application model", a phrase both lexicons hold with the same category, frame, arity and features.
// Nothing outside the title's braces changes, the data form does not carry the title, and diagnostics are mapped
// back to the source as written. The verdict is "checked", never "proved": proof still runs on the real files.

export const ENDPOINT = "https://mcp.uor.foundation/";
export const PROFILE = "prism-app";
export const SUBSTITUTE = "Text application model";
// Phrases the hosted prism.arch already holds; a title made of these is sent as written.
const HOSTED_TITLES = new Set(["Text application model", "Bounded byte buffer"]);

export const modulePath = (name) => `src/${name.split(".").join("/")}.lex.tex`;
export const moduleName = (source) => source.match(/^\s*\\begin\{lexlean\}\{([^}]+)\}/)?.[1];
const imports = (source) => [...source.matchAll(/\\importmodule\{([^}]+)\}/g)].map((m) => m[1]);
const utf8 = (s) => new TextEncoder().encode(s).length;

// Reads library.json and the library sources it names. `readText(path)` resolves a path relative to this folder.
export async function loadLibrary(readText) {
  const manifest = JSON.parse(await readText("library.json"));
  const modules = {};
  await Promise.all(Object.entries(manifest.modules).map(async ([name, path]) => { modules[name] = await readText(path); }));
  return { image: manifest.image, titles: manifest.titles, modules };
}

// Replaces SDK-only title phrases inside the module's one-line \title. Returns the text sent and the edits made,
// each with its line, its byte offset in the original and both lengths, so positions can be mapped back.
export function retitle(source, titles) {
  const m = source.match(/^\\title\{([^}\n]*)\}$/m);
  if (!m) return { content: source, edits: [] };
  const sdkOnly = titles.filter((t) => !HOSTED_TITLES.has(t)).sort((a, b) => b.length - a.length);
  const title = m[1], open = m.index + "\\title{".length;
  const line = source.slice(0, m.index).split("\n").length;
  const edits = [];
  let out = "", i = 0;
  while (i < title.length) {
    const atWord = i === 0 || title[i - 1] === " ";
    const hit = atWord && sdkOnly.find((t) => title.startsWith(t, i) && (i + t.length === title.length || title[i + t.length] === " "));
    if (hit) {
      edits.push({ line, byte: utf8(source.slice(0, open + i)), column: utf8(source.slice(m.index, open + i)) + 1, from: hit.length, to: SUBSTITUTE.length });
      out += SUBSTITUTE; i += hit.length;
    } else out += title[i++];
  }
  return { content: source.slice(0, open) + out + source.slice(open + title.length), edits };
}

// Builds the files to send: the spec, any extra modules of the author's, and the library modules they import,
// transitively. Sending every imported library module also replaces the hosted profile's own copies of them.
export function prepare(spec, { library, extras = [] }) {
  const own = [spec, ...extras].map((source) => ({ name: moduleName(source), source }));
  for (const m of own) if (!m.name) throw Object.assign(new Error("a module has no \\begin{lexlean}{Name} line"), { code: "HC_NO_MODULE" });
  const ownNames = new Set(own.map((m) => m.name));
  const needed = new Set(), queue = own.flatMap((m) => imports(m.source));
  while (queue.length) {
    const name = queue.pop();
    if (ownNames.has(name) || needed.has(name) || !(name in library.modules)) continue;
    needed.add(name); queue.push(...imports(library.modules[name]));
  }
  const files = [], edits = {}, origin = {};
  const add = (name, source, kind) => {
    const path = modulePath(name), r = retitle(source, library.titles);
    files.push({ path, content: r.content }); edits[path] = r.edits; origin[path] = kind;
  };
  for (const name of [...needed].sort()) add(name, library.modules[name], "library");
  for (const m of own) add(m.name, m.source, "author");
  return { files, edits, origin, entry: own[0].name, modules: own.map((m) => m.name) };
}

// Maps one hosted diagnostic back to the text as written. Lines never move: only the title line's text changes.
// Positions after an edit shift by its length difference; positions inside an edit point at the original phrase.
export function mapDiagnostic(d, prepared) {
  const p = d.primary ?? {};
  const edits = prepared.edits[p.path] ?? [];
  // `at` gives an edit's start in the original; a sent position is mapped by undoing the edits before it.
  const back = (pos, list, at) => {
    let shift = 0;
    for (const e of list) {
      const start = at(e) + shift;
      if (pos >= start + e.to) shift += e.to - e.from;
      else if (pos > start) return at(e) + Math.min(pos - start, e.from);
      else break;
    }
    return pos - shift;
  };
  const byte = (b) => back(b, edits, (e) => e.byte);
  const column = (line, c) => back(c, edits.filter((e) => e.line === line), (e) => e.column);
  return {
    code: d.code, severity: d.severity, message: d.message,
    origin: prepared.origin[p.path] ?? "hosted", path: p.path,
    line: p.line_start, column: p.column_start == null ? undefined : column(p.line_start, p.column_start),
    endLine: p.line_end, endColumn: p.column_end == null ? undefined : column(p.line_end, p.column_end),
    byteStart: p.byte_start == null ? undefined : byte(p.byte_start), byteEnd: p.byte_end == null ? undefined : byte(p.byte_end),
  };
}

let rpc = 0;
async function call(fetchFn, endpoint, name, args) {
  let res;
  try {
    res = await fetchFn(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } }) });
  } catch (e) { throw Object.assign(new Error(`hosted service unreachable: ${e.message}`), { code: "HC_UNREACHABLE" }); }
  if (!res.ok) throw Object.assign(new Error(`hosted service answered HTTP ${res.status}`), { code: "HC_HTTP" });
  const body = await res.json();
  if (body.error) {
    const message = body.error.message ?? JSON.stringify(body.error);
    // The service limits calls per client; a corpus run of about fifty calls, repeated, reaches it.
    throw Object.assign(new Error(message), { code: /rate limit/i.test(message) ? "HC_RATE_LIMITED" : "HC_RPC" });
  }
  return { payload: body.result.structuredContent ?? JSON.parse(body.result.content[0].text), refused: !!body.result.isError };
}

// Returns { ok, diagnostics, data, draft, ms }. `data` maps each of the author's modules to its data form, when it checked.
// `onVerdict(ok, diagnostics)` is called as soon as the verdict is known, before the data form is fetched.
export async function check(spec, { library, extras = [], endpoint = ENDPOINT, fetch: fetchFn = globalThis.fetch.bind(globalThis), onVerdict } = {}) {
  const now = () => performance.now(), ms = {};
  const prepared = prepare(spec, { library, extras });
  let t = now();
  const written = await call(fetchFn, endpoint, "lexlean_draft_write", { profile: PROFILE, files: prepared.files });
  if (written.refused || !written.payload.draft) throw Object.assign(new Error(`draft refused: ${JSON.stringify(written.payload)}`), { code: "HC_DRAFT_REFUSED" });
  const draft = written.payload.draft;
  ms.write = now() - t; t = now();
  const checked = (await call(fetchFn, endpoint, "lexlean_check", { project: draft, all: true })).payload;
  ms.check = now() - t;
  const diagnostics = (checked.diagnostics ?? []).map((d) => mapDiagnostic(d, prepared));
  onVerdict?.(!!checked.success, diagnostics);
  if (!checked.success) return { ok: false, diagnostics, draft, ms };
  t = now();
  const data = {};
  await Promise.all(prepared.modules.map(async (name) => {
    const r = await call(fetchFn, endpoint, "lexlean_draft_read", { draft, path: modulePath(name), view: "data" });
    if (r.refused || !r.payload.data) throw Object.assign(new Error(`data form refused for ${name}`), { code: "HC_DATA_REFUSED" });
    data[name] = r.payload.data;
  }));
  ms.data = now() - t;
  return { ok: true, diagnostics, data, draft, entry: prepared.entry, ms };
}
