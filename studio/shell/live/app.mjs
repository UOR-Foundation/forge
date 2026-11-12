// The live preview of a stateful app: a LexLean module in the app shape (State, catalogue, initial,
// view, step) is run as it is written, and each frame it produces is posted to the live frame.
//
// lexlean.mjs reads one shape, a decision. This reads the other. Nothing the model writes is code:
// the module's data form (lexlean/semantic-module/2, from the hosted LexLean service) is interpreted
// by v2/interp.mjs, and the screen is a PrismPM browser presentation, a closed set of content kinds.
//
// A frame drawn from here is a draft. It says nothing about the spec being checked or proved.
import { loadProject, NIL, cons } from "./v2/interp.mjs";
import { describe, fieldValue } from "./v2/render.mjs";
import RULES from "./v2/rules.mjs";

const HOSTED = "https://mcp.uor.foundation/";
const PROFILE = "prism-app";
const MODEL = "Foundation.View.Browser.V1.Model";
const OPEN = "\\begin{semanticmodule}", CLOSE = "\n\\end{semanticmodule}\n\\end{lexlean}\n";
const NEEDED = ["State", "catalogue", "initial", "view"];

/** Where a stateful app's module is kept in its project. */
export const SOURCE_PATH = "prism/App.lex.tex";
/** What the chat shows once a turn has written one. It claims no more than is true. */
export const CARD = "**App** · draft\n\nThis app runs in the preview straight from its LexLean module. It is not checked or proved yet, and it cannot be published yet.";
/** What a model is told about the app shape, after the instructions for a decision. */
export const PROMPT = "\n\n# When the app keeps state: the app shape\nA decision module answers one request. If what is asked for is used over several steps (a list that grows, entries that are kept, a counter, a table of results, a form whose answer stays on the screen), write the module in the app shape instead, in the same <prism-lexlean> block. The shorthand above does not apply to it: write full LexLean, exactly as these rules and their example show, and inside the block write the module and nothing else. Forge runs it in the preview as you write it.\n\n" + RULES;
/** What a model is shown of a stateful app: its module as it stands. */
export const moduleContext = (source) => "The app's current LexLean module, in the app shape:\n<prism-lexlean>\n" + String(source).trim() + "\n</prism-lexlean>";

/** Whether a module, or the start of one, is in the app shape rather than the decision shape. */
export function isAppShape(module) {
  const text = String(module || "");
  if (/\bname:\s*judge\b/.test(text)) return false;
  return /\\importmodule\{Foundation\.View\.Browser\.V1\.Model\}/.test(text) || /structure\{\s*name:\s*State\b/.test(text);
}

/** The module a chat turn is writing: the text after its last <prism-lexlean>, closed or not. */
export function moduleFromTurn(text) {
  const at = String(text || "").lastIndexOf("<prism-lexlean>");
  if (at < 0) return null;
  const rest = text.slice(at + 15), close = rest.indexOf("</prism-lexlean>");
  return { text: close < 0 ? rest : rest.slice(0, close), closed: close >= 0 };
}

/** The whole top-level declarations of a module so far, by matching braces outside strings. */
export function splitDeclarations(module) {
  const start = module.indexOf(OPEN);
  if (start < 0) return { header: null, declarations: [] };
  const body = module.slice(start + OPEN.length), declarations = [];
  const head = /(structure|inductive|definition|theorem)\{/g;
  for (let m; (m = head.exec(body)); ) {
    let depth = 0, inString = false, end = -1;
    for (let i = m.index + m[0].length - 1; i < body.length; i++) {
      const c = body[i];
      if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; continue; }
      if (c === '"') inString = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) { end = i; break; }
    }
    if (end < 0) break;
    const source = body.slice(m.index, end + 1);
    declarations.push({ kind: m[1], name: /name:\s*([A-Za-z0-9_]+)/.exec(source)?.[1] ?? "", source });
    head.lastIndex = end + 1;
  }
  return { header: module.slice(0, start + OPEN.length), declarations };
}

/**
 * The longest runnable start of a module: its header, every whole declaration, and the closing lines.
 * `ready` once the declarations a first frame needs are whole; `interactive` once `step` is.
 */
export function wholePrefix(module) {
  const { header, declarations } = splitDeclarations(module);
  const names = declarations.map((d) => d.name);
  const ready = header !== null && NEEDED.every((n) => names.includes(n));
  // Theorems are not run and may name a proof the reader has not seen whole: they are left out.
  const kept = declarations.filter((d) => d.kind !== "theorem");
  return { ready, interactive: names.includes("step"), names, source: ready ? header + "\n" + kept.map((d) => d.source).join("\n\n") + CLOSE : null };
}

/** The data form of one module, from the hosted service. It parses; it does not check. */
export async function dataForm(source, fetchImpl = fetch) {
  let id = 0;
  const call = async (name, args) => {
    const res = await fetchImpl(HOSTED, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || "the hosted service refused the request");
    const payload = body.result.structuredContent ?? JSON.parse(body.result.content[0].text);
    if (body.result.isError) throw new Error((payload.diagnostics?.[0]?.message || body.result.content?.[0]?.text || "the hosted service refused the module").slice(0, 300));
    return payload;
  };
  const draft = await call("lexlean_draft_write", { profile: PROFILE, files: [{ path: "src/App.lex.tex", content: source }] });
  return (await call("lexlean_draft_read", { draft: draft.draft, path: "src/App.lex.tex", view: "data" })).data;
}

const list = (items) => items.reduceRight((tail, head) => cons(head, tail), NIL);
const plain = (value) => JSON.parse(JSON.stringify(value, (k, v) => (typeof v === "bigint" ? Number(v) : v)));

/** One running app: its state, and the frame it shows. `library` maps a module name to its data form. */
export function createApp(data, library, name = "App") {
  const project = loadProject({ ...library, [name]: data });
  const has = (definition) => project.definitions.includes(name + "::" + definition);
  const catalogue = []; for (let l = project.call(name + "::catalogue"); l.c === "List.cons"; l = l.a[1]) catalogue.push(l.a[0]);
  let state = project.call(name + "::initial");
  const frame = () => {
    const presentation = project.call(name + "::view", state);
    // The protocol's own rule decides whether a frame may be drawn.
    if (!project.call(MODEL + "::presentationValid", presentation)) throw new Error("the view is not a frame the protocol admits");
    return { revision: String(presentation.revision), live: Number(presentation.live), nodes: plain(describe(presentation, catalogue)) };
  };
  return {
    interactive: has("step"),
    frame,
    /** `fields`: [{ node, text } | { node, choice }], as the frame sends them. Returns the next frame. */
    act(action, fields = []) {
      if (!has("step")) return frame();
      const intent = { revision: state.revision, action: BigInt(action), fields: list(fields.map((f) => fieldValue({ node: BigInt(f.node), ...(f.text !== undefined ? { text: String(f.text) } : { choice: BigInt(f.choice) }) }))) };
      state = project.call(name + "::step", state, intent);
      return frame();
    },
  };
}

/**
 * Follows the modules a chat turn streams for each app and posts frames as they become runnable.
 * `post(appId, message)` delivers a `live/presentation` message to that app's frame.
 */
export function appLive({ post, library, fetchImpl = fetch, now = () => performance.now() }) {
  const apps = new Map(); // appId -> { source, app, last, wanted, busy, trust, note }
  const entry = (appId) => { if (!apps.has(appId)) apps.set(appId, { source: null, app: null, last: null, wanted: null, busy: false, trust: "draft", note: null }); return apps.get(appId); };
  const send = (appId) => {
    const a = apps.get(appId);
    if (!a || !a.last) return;
    post(appId, { type: "live/presentation", app: String(appId), ...a.last, interactive: !!(a.app && a.app.interactive), trust: a.trust, note: a.note });
  };
  async function run(appId) {
    const a = entry(appId);
    if (a.busy) return;
    a.busy = true;
    try {
      while (a.wanted !== null && a.wanted !== a.source) {
        const source = a.wanted, t0 = now();
        try {
          const app = createApp(await dataForm(source, fetchImpl), library);
          const frame = app.frame();
          a.app = app; a.last = { ...frame, ms: Math.round(now() - t0) }; a.note = null;
        } catch (e) {
          // A start of a module that does not run yet (a helper still to come, a frame not yet valid)
          // keeps the last frame that did; only the note changes.
          a.note = String(e && e.message || e).slice(0, 200);
        }
        a.source = source;
        send(appId);
      }
    } finally { a.busy = false; }
  }
  return {
    /** The module text so far. Returns whether it is runnable yet. */
    push(appId, module, trust = "draft") {
      const prefix = wholePrefix(module);
      const a = entry(appId);
      a.trust = trust;
      if (!prefix.ready) return false;
      a.wanted = prefix.source;
      run(appId);
      return true;
    },
    /** An action pressed in the frame. A frame of another revision is out of date and is answered with the current one. */
    intent(appId, message) {
      const a = apps.get(appId);
      if (!a || !a.app) return false;
      try { a.last = { ...(String(message.revision) === a.last.revision ? a.app.act(message.action, Array.isArray(message.fields) ? message.fields : []) : a.app.frame()), ms: a.last.ms }; a.note = null; }
      catch (e) { a.note = String(e && e.message || e).slice(0, 200); }
      send(appId);
      return true;
    },
    resend: send,
    has: (appId) => !!(apps.get(appId) && apps.get(appId).last),
    forget: (appId) => apps.delete(appId),
    /** Resolves when nothing is being fetched for this app. For tests and for the end of a turn. */
    async settled(appId) { const a = apps.get(appId); while (a && (a.busy || (a.wanted !== null && a.wanted !== a.source))) await new Promise((r) => setTimeout(r, 5)); },
  };
}
