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
import * as notation from "./notation.mjs";
import { check as hostedCheck, loadLibrary, prepare } from "./v2/check.mjs";
import { isStatefulModule as isAppShape } from '../application-shape.mjs';
export { isAppShape };

import { HOSTED_SOURCE_ENDPOINT as HOSTED, withHostedSourcePermission } from "../hosted-source-permission.mjs";
export { createHostedSourceSession } from "../hosted-source-permission.mjs";
const PROFILE = "prism-app";
const MODEL = "Foundation.View.Browser.V1.Model";
const OPEN = "\\begin{semanticmodule}", CLOSE = "\n\\end{semanticmodule}\n\\end{lexlean}\n";
const NEEDED = ["State", "catalogue", "initial", "view"];

/** Where what is known about a stateful app's module is kept: its phase, and what the checker said. */
export const STATE_PATH = "prism/app.json";
/** What the chat shows for a state. It claims no more than the state holds. */
export function card(state) {
  if (state.phase === "proving") return "**App** · Lean is proving\n\nLean is checking this app's properties on the hosted verifier.";
  if (state.phase === "proved") return "**App** · proved by Lean\n\nLean proved " + (state.theorems || []).length + " theorem" + ((state.theorems || []).length === 1 ? "" : "s") + " about this app. Attestation `" + String(state.proof && state.proof.attestation_id || "").slice(0, 16) + "…`. It cannot be published yet.";
  if (state.phase === "checked") return "**App** · checked\n\nThe checker accepts this app's module. Preview parsing uses separately approved hosted access. It is not proved yet, and it cannot be published yet.";
  if (state.issues && state.issues.length) return "**App** · not checked\n\n" + state.issues.map((i) => "- " + i).join("\n") + "\n\nIt still runs in the preview as far as it can. Ask me to fix the module.";
  return CARD + (state.unchecked ? "\n\nIt could not be checked just now: " + state.unchecked : "");
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
export async function checkApp(module, library, fetchImpl = globalThis.fetch, options = {}) {
  const t0 = performance.now(), source = String(module).trim() + "\n", loaded = await library;
  const files = prepare(source, { library: loaded }).files;
  const result = await withHostedSourcePermission({ purpose: "check", files }, async (permittedFetch) => {
    let failure;
    try { return await hostedCheck(source, { library: loaded, fetch: async (...args) => { try { return await permittedFetch(...args); } catch (error) { failure = error; throw error; } } }); }
    catch (error) { throw failure || error; }
  }, options, fetchImpl);
  const issues = result.ok ? [] : result.diagnostics.filter((d) => d.severity !== "warning").map(issueLine);
  return { ok: !!result.ok, issues: result.ok ? [] : issues.length ? issues.slice(0, 8) : ["The checker refused the module and gave no reason."], ms: Math.round(performance.now() - t0) };
}

/** Where a stateful app's module is kept in its project. */
export const SOURCE_PATH = "prism/App.lex.tex";
/** Where the lines a model wrote for it are kept: only a shorter way to show a model the same module. */
export const NOTATION_PATH = "prism/app.notation";
/** What the chat shows once a turn has written one. It claims no more than is true. */
export const CARD = "**App** · draft\n\nThis app is stored as a LexLean module. Preview parsing and checking require approval to send source to mcp.uor.foundation. It is not checked or proved yet, and it cannot be published yet.";
/** What a model is told about the app shape, after the instructions for a decision. */
export const PROMPT = "\n\n# When the app keeps state: the app notation\nA decision module answers one request. If what is asked for is used over several steps (a list that grows, entries that are kept, a table of results), the shorthand above does not apply. " + notation.PROMPT;
/** What a model is shown of a stateful app: its module as it stands. */
export const moduleContext = (source, lines) => {
  // The lines are shown only while they still stand for this very module, byte for byte.
  if (typeof lines === "string" && lines.trim()) { const e = notation.expand(lines); if (e.ok && e.module.trim() === String(source).trim()) return "The app's current lines, in the app notation:\n<prism-lexlean>\n" + lines.trim() + "\n</prism-lexlean>"; }
  return "The app's current LexLean module, in the app shape:\n<prism-lexlean>\n" + String(source).trim() + "\n</prism-lexlean>";
};
/** What a model is asked when its lines do not read: the reader's words, the whole block again. */
export const notationRepairPrompt = (issues) => "Forge could not read your lines:\n" + issues.slice(0, 8).map((i) => "- Line " + i.line + ": " + i.message).join("\n") + "\nWrite all the lines again, in one <prism-lexlean> block, with that fixed and nothing else changed. Write nothing but the block.";
/** What the chat shows when a turn's lines still do not read. It claims nothing about an app. */
export const notationCard = (issues) => "**App** · not read\n\nForge could not read this turn's lines, so nothing was changed:\n" + issues.slice(0, 8).map((i) => "- Line " + i.line + ": " + i.message).join("\n") + "\n\nAsk me to fix it.";

/** Whether a module, or the start of one, is in the app shape rather than the decision shape. */

/** The module a chat turn is writing: the text after its last <prism-lexlean>, closed or not. */
export function moduleFromTurn(text, { final = false } = {}) {
  const at = String(text || "").lastIndexOf("<prism-lexlean>");
  if (at < 0) return null;
  const rest = text.slice(at + 15), close = rest.indexOf("</prism-lexlean>");
  const block = close < 0 ? rest : rest.slice(0, close), closed = close >= 0;
  // Lines in the app notation stand for a module: the module is what the turn wrote. While the turn is
  // still streaming, a last line that does not read yet is left out. Final reads refuse it.
  if (notation.isNotation(block)) { const e = notation.expand(block.replace(/^\s+/, ""), { lenient: !closed && !final }); return { text: e.ok ? e.module : "", closed, notation: block.trim() + "\n", issues: e.issues }; }
  return { text: block, closed };
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
export async function dataForm(source, fetchImpl = globalThis.fetch, options = {}) {
  const files = [{ path: "src/App.lex.tex", content: source }];
  return withHostedSourcePermission({ purpose: "parse", files }, async (permittedFetch) => {
    let id = 0;
    const call = async (name, args) => {
      const res = await permittedFetch(HOSTED, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
      return (await res.json()).result.structuredContent;
    };
    const draft = await call("lexlean_draft_write", { profile: PROFILE, files });
    return (await call("lexlean_draft_read", { draft: draft.draft, path: "src/App.lex.tex", view: "data" })).data;
  }, options, fetchImpl);
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
export function appLive({ post, library, fetchImpl = globalThis.fetch, now = () => performance.now(), permissionOptions = {} }) {
  const apps = new Map(); // Each wanted/attempted identity includes source and its permission scope.
  const entry = (appId) => { if (!apps.has(appId)) apps.set(appId, { app: null, last: null, wanted: null, attempted: null, busy: false, trust: "draft", frameSource: null, note: null, controller: null }); return apps.get(appId); };
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
      while (apps.get(appId) === a && a.wanted !== null && a.wanted !== a.attempted) {
        const requested = a.wanted, { source, options } = requested, t0 = now();
        const controller = new AbortController(), abort = () => controller.abort(); a.controller = controller;
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted) abort();
        try {
          const app = createApp(await dataForm(source, fetchImpl, { ...permissionOptions, ...options, signal: controller.signal }), library);
          if (controller.signal.aborted || apps.get(appId) !== a || a.wanted !== requested) throw new Error("Hosted preview was superseded");
          const frame = app.frame();
          a.app = app; a.last = { ...frame, ms: Math.round(now() - t0) }; a.frameSource = source; a.trust = requested.trust; a.note = null;
        } catch (e) {
          // A start of a module that does not run yet (a helper still to come, a frame not yet valid)
          // keeps the last frame that did; only the note changes.
          if (!controller.signal.aborted && apps.get(appId) === a && a.wanted === requested) a.note = String(e && e.message || e).slice(0, 200);
        } finally { options.signal?.removeEventListener("abort", abort); if (a.controller === controller) a.controller = null; }
        if (a.wanted === requested) { a.attempted = requested; if (!controller.signal.aborted) send(appId); }
      }
    } finally { a.busy = false; }
  }
  return {
    /** The module text so far. Returns whether it is runnable yet. */
    push(appId, module, trust = "draft", options = {}) {
      const prefix = wholePrefix(module);
      const a = entry(appId);
      if (!prefix.ready) {
        a.controller?.abort(); a.wanted = null;
        return false;
      }
      const sameRequest = a.wanted && a.wanted.source === prefix.source && a.wanted.options.session === options.session && a.wanted.options.signal === options.signal;
      if (!sameRequest) {
        a.controller?.abort();
        a.wanted = { source: prefix.source, trust, options: { ...options } };
      } else a.wanted.trust = trust;
      // Reusing a rendered frame still supersedes every other pending request first.
      if (prefix.source === a.frameSource && a.last) {
        a.attempted = a.wanted; a.trust = trust; a.note = null; send(appId); return true;
      }
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
    forget: (appId) => { apps.get(appId)?.controller?.abort(); return apps.delete(appId); },
    /** Resolves when nothing is being fetched for this app. For tests and for the end of a turn. */
    async settled(appId) { const a = apps.get(appId); while (a && apps.get(appId) === a && a.busy) await new Promise((r) => setTimeout(r, 5)); },
  };
}
