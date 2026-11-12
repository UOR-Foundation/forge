// The live preview of a stateful app: a LexLean module in the app shape (State, catalogue, initial,
// view, step) is run as it is written, and each frame it produces is posted to the live frame.
//
// lexlean.mjs reads one shape, a decision. This reads the other. Nothing the model writes is code:
// the module's data form (lexlean/semantic-module/2, read by LexLean itself: in this tab when its checker
// is loaded, by the hosted LexLean service until then) is interpreted by v2/interp.mjs, and the screen is
// a PrismPM browser presentation, a closed set of content kinds.
//
// A frame drawn from here is a draft. It says nothing about the spec being checked or proved.
import { loadProject, NIL, cons } from "./v2/interp.mjs";
import { describe, fieldValue } from "./v2/render.mjs";
import RULES from "./v2/rules.mjs";
import { check as hostedCheck, loadLibrary, prepare } from "./v2/check.mjs";
import { createClient } from "./v2/in-tab/client.mjs";

const HOSTED = "https://mcp.uor.foundation/";
const PROFILE = "prism-app";
const MODEL = "Foundation.View.Browser.V1.Model";
const OPEN = "\\begin{semanticmodule}", CLOSE = "\n\\end{semanticmodule}\n\\end{lexlean}\n";
const NEEDED = ["State", "catalogue", "initial", "view"];

/** Where what is known about a stateful app's module is kept: its phase, and what the checker said. */
export const STATE_PATH = "prism/app.json";
/** What the chat shows for a state. It claims no more than the state holds. */
export function card(state) {
  const route = routeLine(state.by);
  if (state.phase === "proving") return "**App** · Lean is proving\n\nLean is checking this app's properties on the hosted verifier.";
  if (state.phase === "proved") return "**App** · proved by Lean\n\nLean proved " + (state.theorems || []).length + " theorem" + ((state.theorems || []).length === 1 ? "" : "s") + " about this app. Attestation `" + String(state.proof && state.proof.attestation_id || "").slice(0, 16) + "…`. It cannot be published yet.";
  if (state.phase === "checked") return "**App** · checked\n\nThe checker accepts this app's module, and it runs in the preview from it. It is not proved yet, and it cannot be published yet." + (route ? "\n\n" + route : "");
  if (state.issues && state.issues.length) return "**App** · not checked\n\n" + state.issues.map((i) => "- " + i).join("\n") + (route ? "\n\n" + route : "") + "\n\nIt still runs in the preview as far as it can. Ask me to fix the module.";
  return CARD + (state.unchecked ? "\n\nIt could not be checked just now: " + state.unchecked : "");
}
/**
 * Which checker answered, in plain words. `by` is what the answer carried: the route and, when the hosted
 * service answered, why the checker in this tab did not. A state with no `by` claims no route.
 */
export function routeLine(by) {
  if (!by) return "";
  if (by.route === "in-tab") return "Checked in this tab.";
  if (!by.instead) return "Checked by the hosted service.";
  if (by.instead.code === "ITC_NOT_LOADED") return "Checked by the hosted service while the checker in this tab loads.";
  return "Checked by the hosted service, because the checker in this tab could not run: " + by.instead.message + " (" + by.instead.code + ")";
}
/** The theorems a module states: name, exact statement, proof form. */
export function theoremsOf(module) {
  return splitDeclarations(String(module)).declarations.filter((d) => d.kind === "theorem").map((d) => ({
    name: d.name,
    statement: (/\n\s*statement:\s*([\s\S]*?),\s*\n\s*proof:/.exec(d.source) || [])[1]?.trim() ?? "",
    form: (/proof:\s*([a-z_]+)/.exec(d.source) || [])[1] ?? "",
  }));
}
/** The plain sentences a module promises, in order: the string literals of its `promises` definition. */
export function promisesOf(module) {
  const d = splitDeclarations(String(module)).declarations.find((x) => x.kind === "definition" && x.name === "promises");
  if (!d) return [];
  return [...d.source.slice(d.source.indexOf("body:")).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
}
/** The module with the axiom sets Lean named ({ theorem: "[a, b]" }) written into those declarations. */
export function withAxioms(module, axioms) {
  let text = String(module);
  for (const [name, set] of Object.entries(axioms || {})) {
    const d = splitDeclarations(text).declarations.find((x) => x.name === name);
    if (!d) continue;
    const fixed = /axioms:\s*\[[^\]]*\]/.test(d.source) ? d.source.replace(/axioms:\s*\[[^\]]*\]/, "axioms: " + set) : d.source.replace(/\s*\}$/, ",\n  axioms: " + set + "\n}");
    text = text.replace(d.source, fixed);
  }
  return text;
}
/**
 * The files a proof of this module is asked on, and which of them must come back verified. The
 * library module goes with its title's words replaced, as for a check: the hosted lexicon lacks them.
 * So the attestation is about this draft, whose declarations are the module's and the library's own.
 */
export function proofFiles(module, library) {
  const prepared = prepare(String(module).trim() + "\n", { library });
  return { files: prepared.files, entrypoints: prepared.files.filter((f) => prepared.origin[f.path] === "author").map((f) => f.path) };
}
/** What the chat says while Lean works, and when it ends. */
export const provingMessage = (count) => "Proving " + count + " propert" + (count === 1 ? "y" : "ies") + " of this app with Lean on the hosted verifier. This can take ten minutes or more. The preview keeps working meanwhile.";
export function proofMessage(result) {
  if (!result.ok) {
    // Lean refusing a theorem (a verification diagnostic, LLV…) is about the app. Anything else, a
    // verifier that ran out of room or time or did not answer, is about the verifier, and says so.
    const refused = (result.diagnostics || []).some((d) => /^LLV/.test(String(d.code || "")));
    const why = String(result.error || "Lean refused the proof").replace(/\.+$/, "");
    return refused
      ? "**Not proved.** Lean refused it: " + why + ". The app is back to checked. Ask me to fix the property, or to drop it."
      : "**Not proved.** The verifier could not run the proof: " + why + ". This says nothing about the app. It is back to checked; reply approve to try again.";
  }
  const lines = result.theorems.map((t, i) => "- " + (result.promises[i] ? result.promises[i] + "\n  Lean proved: " : "Lean proved: ") + "`" + t.statement + "`");
  return "**Proved by Lean.** " + result.theorems.length + " theorem" + (result.theorems.length === 1 ? "" : "s") + " about this app, for every state, in " + result.seconds + " s. Attestation `" + result.record.attestation_id.slice(0, 16) + "…`.\n\n" + lines.join("\n") + "\n\nA sentence can say more than its theorem: the statement is what is proved. The app cannot be published yet.";
}

/** One line a person or a model can act on. */
export const issueLine = (d) => (d.line ? "Line " + d.line + ": " : "") + d.message + (d.code ? " (" + d.code + ")" : "");
/** What a model is asked when the checker refuses its module: its own module, the checker's words, the whole module again. */
export const repairPrompt = (issues) => "The checker refused your module:\n" + issues.map((i) => "- " + i).join("\n") + "\nWrite the whole module again, in one <prism-lexlean> block, with that fixed and nothing else changed. Write nothing but the block.";

/** The library the checker sends with a module. `readText(path)` reads a file beside the checker (shell/live/v2/). */
export const checkLibrary = (readText) => loadLibrary(readText);
/**
 * Checks a module on the hosted service. Resolves { ok, issues, ms }; `issues` are lines about the
 * module as written. It checks; it does not prove. Rejects when the service cannot be reached.
 */
export async function checkApp(module, library, fetchImpl, extras = []) {
  const t0 = performance.now();
  const result = await hostedCheck(String(module).trim() + "\n", { library: await library, extras, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  return verdictOf(result, t0);
}
// Why a tab's checker is refused for good: its bytes, its compiler, its policy or its manifest are not the ones named.
const FINAL = new Set(["ITC_ADDRESS", "ITC_VERSION", "ITC_IMPORT", "ITC_POLICY", "ITC_MANIFEST", "ITC_ABSENT"]);
const verdictOf = (result, t0) => {
  const issues = result.ok ? [] : result.diagnostics.filter((d) => d.severity !== "warning").map(issueLine);
  return { ok: !!result.ok, issues: result.ok ? [] : issues.length ? issues.slice(0, 8) : ["The checker refused the module and gave no reason."], ms: Math.round(performance.now() - t0) };
};
/**
 * The studio's checker. A module is checked in this tab when the tab's checker is ready, and by the hosted
 * service while that one loads or when it cannot run; `only: "in-tab"` never sends a module anywhere and
 * waits for the tab instead. `check` resolves what `checkApp` does and also `by` (the route, and why the tab
 * did not answer when it did not), `cached`, and on a pass `data`, each of the author's modules' data form.
 * `tab()` resolves what the tab's checker is made of (v2/in-tab/client.mjs); with none, only the hosted
 * service checks. `library()` resolves what the hosted route sends with a module, and is asked for only then.
 */
export function appChecker({ library, fetchImpl, tab = null, onState = () => {}, retryMs = 60000, now = () => performance.now() }) {
  const absent = () => Promise.reject(Object.assign(new Error("this page has no checker of its own"), { code: "ITC_ABSENT" }));
  let failedAt = 0;
  const client = createClient({
    parts: tab || absent, onState: (state, detail) => { if (state === "unavailable") failedAt = now(); onState(state, detail); },
    hosted: async (spec, { extras = [] } = {}) => hostedCheck(spec, { library: await library(), extras, ...(fetchImpl ? { fetch: fetchImpl } : {}) }),
    hostedData: (source) => dataForm(source, fetchImpl),
  });
  return {
    /** Loads the tab's checker. Resolves whether it is ready; never rejects. */
    start: () => client.start().then(() => true, () => false),
    state: client.state,
    /** What is known of the tab's checker: when ready, `by` names LexLean's version and the checker's address. */
    detail: client.detail,
    async check(module, { extras = [], only = null } = {}) {
      const t0 = performance.now();
      const result = await client.check(String(module).trim() + "\n", { extras, only });
      // A tab whose checker failed for a reason that can pass is tried again, in the background, at most once a
      // `retryMs`. A refusal is final until the page is loaded again: the same bytes would be refused again.
      if (client.state() === "unavailable" && !FINAL.has(client.detail()?.code) && now() - failedAt >= retryMs) { failedAt = now(); client.retry().catch(() => {}); }
      return { ...verdictOf(result, t0), by: result.by, cached: result.cached, ...(result.ok && result.data ? { data: result.data } : {}) };
    },
    /** The data form of a module as written: read, not checked. Resolves { data, by }. */
    data: (source, { only = null } = {}) => client.data(source, { only }),
  };
}

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
export async function dataForm(source, fetchImpl) {
  fetchImpl ||= fetch;
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
export function appLive({ post, library, fetchImpl = fetch, dataOf = (source) => dataForm(source, fetchImpl), now = () => performance.now() }) {
  const apps = new Map(); // appId -> { source, app, last, wanted, busy, trust, note, given }
  const entry = (appId) => { if (!apps.has(appId)) apps.set(appId, { source: null, app: null, last: null, wanted: null, busy: false, trust: "draft", note: null, given: null }); return apps.get(appId); };
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
          const app = createApp(a.given && a.given.source === source ? a.given.data : await dataOf(source), library);
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
    /**
     * The module text so far. Returns whether it is runnable yet. `data`, when a check of this very module
     * passed, is the data form that check read: the frame is drawn from it and nothing is asked for.
     */
    push(appId, module, trust = "draft", data = null) {
      const prefix = wholePrefix(module);
      const a = entry(appId);
      a.trust = trust;
      if (!prefix.ready) return false;
      // Theorems are not run (wholePrefix leaves them out of the source too).
      if (data && Array.isArray(data.declarations)) a.given = { source: prefix.source, data: { ...data, declarations: data.declarations.filter((d) => d.kind !== "theorem") } };
      // The same module with a new standing (checked, say) is the same frame under a new badge.
      if (prefix.source === a.source && a.last) { send(appId); return true; }
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
