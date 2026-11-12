// Development harness for the product loop: a model writes a LexLean spec against PrismPM's content
// kinds, the spec is checked, and the interpreter runs it. Measures each stage.
//
// The model is reached through the Claude Code CLI on this machine (CLAUDE_CODE_EXECPATH), so the
// timings include that program's start-up and are not those of a direct API call.
// Checking runs `lexlean check` in the pinned SDK image through WSL, because the hosted checker's
// profile lacks the lexicon entries of the library modules a spec imports.
//
// Run: node loop.mjs "<one sentence describing the app>" [name]
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject, toArray } from "../shell/interp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sentence = process.argv[2];
const rulesOnly = sentence === "--rules";
const name =(process.argv[3] ?? "app").replace(/[^a-z0-9-]/gi, "-");
if (!sentence) { console.error('usage: node loop.mjs "<sentence>" [name]'); process.exit(64); }
// With a third argument, the module is read from that file instead of asked of a model, and the
// harness runs once with no repair round: `node loop.mjs "<sentence>" <name> <module file>`.
// With `--rules` as the only argument, it prints the instructions a model is given.
const fromFile = process.argv[4] ? resolve(process.argv[4]) : null;
const cli = process.env.CLAUDE_CODE_EXECPATH;
if (!rulesOnly && !fromFile && !cli) { console.error("CLAUDE_CODE_EXECPATH is not set: no model to ask"); process.exit(69); }

const scaffold = resolve(here, "../probe-payment");
const work = join(here, "work", name);
const example = readFileSync(join(scaffold, "src/Payment.lex.tex"), "utf8");
const now = () => performance.now();
const MODEL = "Foundation.View.Browser.V1.Model::";

const rules = `You write one LexLean semantic module. Output only the module, from \\begin{lexlean}{App} to \\end{lexlean}, with no prose and no code fence.

The module is an app in a fixed shape. It must declare, in this order:
1. structure State, whose first field is revision : Nat.
2. definition catalogue : (List String), every label the view shows, referred to by zero-based index.
3. definition initial : State.
4. definition view (state : State) : ${MODEL}Presentation.
5. any helper definitions, then definition step (state : State, intent : ${MODEL}Intent) : State.

Rules of the view protocol (PrismPM browser presentation):
- A Presentation is {revision, phase, status, live, focus, nodes}. Use phase 0, status 0, live 1, focus 0, and revision := (project state revision).
- nodes is a flat list. A node is {parent, content}. Nodes are numbered from 1 in list order. parent 0 is the root; any other parent must be an earlier Section, Navigation or Form.
- Content constructors and their arguments:
  Section label | Navigation label | Form label | Heading level label | Text string
  Input label enabled required maximum value epoch | Multiline (same as Input)
  Select label enabled required selected choices epoch, choices : (List ${MODEL}Choice), a Choice is {id, label}, ids start at 1 and increase, selected 0 means none
  Action label id enabled default fields, fields : (List Nat) are the node numbers of the form fields it sends, in increasing order
  Table caption columns chunks, columns : (List Nat) labels, chunks : (List ${MODEL}TableChunk); a TableChunk is {rows}, a TableRow is {cells : (List String)}; at most 16 rows in the one chunk, no chunk when there are no rows, each row has exactly one cell per column
- Inputs, selects and actions must be direct children of a Form. A form holds at most one default action. Action ids are unique and nonzero.
- An Input's value must be at most maximum bytes of UTF-8.
- epoch is the draft epoch of a field. The page keeps what the person typed in a field for as long as that field's epoch and value stay the same, and resets the field to value when either changes. For a field that should empty after an action, give it value "" and epoch := (project state revision). For a field that should keep what was sent, store that text in the state, show it as value, and use epoch 0.
- required true only marks a field for the person; an action sends only the fields it lists.
- An Intent is {revision, action, fields}; fields : (List ${MODEL}FieldValue); a FieldValue is {node, value}; value is ${MODEL}Value.Text string or ${MODEL}Value.Choice nat.
- step must return state unchanged when (project intent revision) differs from (project state revision), and must add 1 to revision whenever it changes anything.

Rules of the language, which the checker enforces:
- Copy syntax only from the example. Do not invent constructs.
- Every use of a library type or constructor is written with its full module name, as in the example.
- A recursive definition names its recursive_argument and recurses on a strictly smaller part of it.
- Names that Lean already uses are refused: do not name anything id, decide, take, map, length, some, none, max, min, not, and, or.
- A definition that uses utf8_decode, or calls one that does, declares axioms: [Classical.choice, Quot.sound, propext].
- There is no string concatenation and no number formatting. Text shown comes from string literals, from the catalogue, or unchanged from what the person typed.
- The header is exactly:
\\begin{lexlean}{App}
\\useglossary{lexlean.std.bool@1.2.0}
\\useglossary{lexlean.std.nat@1.2.0}
\\useglossary{prism.arch@1.0.0}
\\importmodule{Foundation.View.Browser.V1.Model}
\\title{Browser view model}
\\begin{semanticmodule}
and the footer is \\end{semanticmodule} then \\end{lexlean}.
- After step, write the properties: first definition promises : (List String), then one theorem per promise, in the same order.
  A promise is one plain sentence about what the app always or never does, written for a person who cannot read the spec and must be able to agree or disagree with it. Promise only what the app description asks for or what a person would rely on. Write between three and six.
  Each theorem states its promise exactly, about every state (and every intent, when it concerns step), unless the promise is about the first screen.
- Only three proof forms exist. Choose the property so that one of them can close it:
  reflexivity{} proves an equation whose two sides become identical once definitions are unfolded, for example that a field of the record a definition builds has a given value. Give it axioms: [].
  linear_arithmetic{definitions: [names]} proves a fact about numbers after unfolding the listed definitions, which must not be recursive. To promise that something never happens, define a Bool that is true exactly when it happens, as definition breaksName, using =? <? <=? && || and not, and state ((breaksName state intent) = false); list breaksName and every definition it reaches. Give it axioms: [propext]. Write the listed names in ascending character order, each once.
  decide{} proves a fact about one fixed value with no parameters, such as a property of (initial) or of (view (initial)). Give it axioms: [].
- There is no induction. A property that needs it, such as one about every list, cannot be proved here: say it as a promise only if one of the three forms can close it, otherwise leave it out.
- A theorem has the fields name, parameters, statement, proof, axioms, as in the example.

A complete, checked example of the shape (it imports one extra module you must not import):

${example}`;

if (rulesOnly) { process.stdout.write(rules + "\n"); process.exit(0); }

// One call to the model. Returns the text and when its first character and each declaration arrived.
function ask(prompt) {
  return new Promise((done, fail) => {
    const t0 = now();
    const child = spawn(cli, ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--max-turns", "1", "--system-prompt", "You are a compiler front end. You output LexLean source and nothing else."], { cwd: here, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", text = "", firstText = null, seen = 0; const declarations = [];
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let nl; (nl = buffer.indexOf("\n")) >= 0; buffer = buffer.slice(nl + 1)) {
        let event; try { event = JSON.parse(buffer.slice(0, nl)); } catch { continue; }
        const delta = event.event?.delta;
        if (event.type === "stream_event" && delta?.type === "text_delta") {
          if (firstText === null) firstText = now() - t0;
          text += delta.text;
          const found = splitDeclarations(text);
          for (; seen < found.complete.length; seen++) declarations.push({ name: found.complete[seen].name, ms: Math.round(now() - t0) });
        }
        if (event.type === "result" && !text) text = event.result ?? "";
      }
    });
    let err = ""; child.stderr.on("data", (c) => { err += c; });
    child.on("error", fail);
    child.on("close", (code) => (text ? done({ text, firstText: Math.round(firstText ?? 0), total: Math.round(now() - t0), declarations }) : fail(new Error("model gave no text (exit " + code + "): " + err.slice(0, 300)))));
    child.stdin.end(prompt);
  });
}

// Top-level `kind{ ... }` blocks inside the semantic module, by matching braces outside strings.
export function splitDeclarations(text) {
  const start = text.indexOf("\\begin{semanticmodule}");
  const complete = []; if (start < 0) return { complete };
  const body = text.slice(start + "\\begin{semanticmodule}".length);
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
    complete.push({ kind: m[1], name: /name:\s*([A-Za-z0-9_]+)/.exec(source)?.[1] ?? "?", source });
    head.lastIndex = end + 1;
  }
  return { complete };
}

const moduleOf = (text) => { const a = text.indexOf("\\begin{lexlean}{App}"), b = text.lastIndexOf("\\end{lexlean}"); return a >= 0 && b > a ? text.slice(a, b + "\\end{lexlean}".length) + "\n" : null; };
const toWsl = (p) => "/mnt/" + p[0].toLowerCase() + p.slice(2).replaceAll("\\", "/");

function check() {
  return new Promise((done) => {
    const t0 = now();
    const child = spawn("wsl", ["-d", "Ubuntu", "--", "bash", toWsl(join(work, "build-local.sh")), "lexlean lock >/dev/null && lexlean --diagnostic-format json check --all"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; child.stdout.on("data", (c) => { out += c; }); child.stderr.on("data", (c) => { out += c; });
    child.on("close", () => {
      let result = null; for (const line of out.split("\n")) { try { const j = JSON.parse(line); if (j.spec === "lexlean/command-result/1") result = j; } catch {} }
      done({ ms: Math.round(now() - t0), ok: !!result?.success, diagnostics: result ? result.diagnostics.map((d) => `${d.code} at line ${d.primary?.line_start}: ${d.message}`) : [out.trim().slice(-600)] });
    });
  });
}

async function dataForm(source) {
  const t0 = now();
  const call = async (tool, args) => {
    const res = await fetch("https://mcp.uor.foundation/", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }) });
    const body = await res.json(); if (body.error || body.result.isError) throw new Error((body.error?.message ?? body.result.content?.[0]?.text ?? "").slice(0, 400));
    return body.result.structuredContent ?? JSON.parse(body.result.content[0].text);
  };
  const draft = await call("lexlean_draft_write", { profile: "prism-app", files: [{ path: "src/App.lex.tex", content: source }] });
  const read = await call("lexlean_draft_read", { draft: draft.draft, path: "src/App.lex.tex", view: "data" });
  return { data: read.data, ms: Math.round(now() - t0) };
}

// Every theorem through Lean and leanchecker, with exact axioms. `lexlean fmt` first, because verify refuses a non-canonical source.
function verify() {
  return new Promise((done) => {
    const t0 = now();
    const child = spawn("wsl", ["-d", "Ubuntu", "--", "bash", toWsl(join(work, "build-local.sh")), "lexlean fmt --all >/dev/null && lexlean lock >/dev/null && lexlean --diagnostic-format json verify --all"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; child.stdout.on("data", (c) => { out += c; }); child.stderr.on("data", (c) => { out += c; });
    child.on("close", () => {
      let result = null; for (const line of out.split("\n")) { try { const j = JSON.parse(line); if (j.spec === "lexlean/command-result/1") result = j; } catch {} }
      const attestation = /attestation\W+([0-9a-f]{64})/.exec(out)?.[1] ?? /"([0-9a-f]{64})"/.exec(JSON.stringify(result?.artifacts ?? []))?.[1];
      done({ ms: Math.round(now() - t0), ok: !!result?.success, attestation, diagnostics: result ? result.diagnostics.map((d) => `${d.code}: ${d.message}`) : [out.trim().slice(-600)] });
    });
  });
}

// The attestation the checker wrote last, with what it says about each theorem.
function newestAttestation() {
  const dir = join(work, ".lexlean/verified");
  if (!existsSync(dir)) return undefined;
  const newest = readdirSync(dir).map((id) => ({ id, file: join(dir, id, "attestation.json") })).filter((a) => existsSync(a.file)).sort((x, y) => statSync(y.file).mtimeMs - statSync(x.file).mtimeMs)[0];
  return newest?.id;
}

// Rewrites the axiom list of one declaration to the set Lean observed.
function setAxioms(text, declaration, observed) {
  const start = text.indexOf("\\begin{semanticmodule}") + "\\begin{semanticmodule}".length;
  for (const d of splitDeclarations(text).complete) {
    if (d.name !== declaration) continue;
    const at = text.indexOf(d.source, start);
    const fixed = /axioms:\s*\[[^\]]*\]/.test(d.source) ? d.source.replace(/axioms:\s*\[[^\]]*\]/, `axioms: [${observed}]`) : d.source.replace(/\s*\}$/, `,\n  axioms: [${observed}]\n}`);
    return text.slice(0, at) + fixed + text.slice(at + d.source.length);
  }
  return text;
}

// The plain sentences the spec promises, in order: its `promises` definition, a list of string literals.
function promisesOf(data) {
  const out = [];
  for (let node = data.declarations.find((d) => d.name === "promises")?.body; node?.kind === "cons"; node = node.tail) out.push(node.head.value);
  return out;
}

// The library modules' data forms are the ones already fetched for the payment probe.
function run(appData) {
  const base = join(scaffold, "data");
  const names = JSON.parse(readFileSync(join(base, "modules.json"), "utf8")).filter((n) => n.startsWith("Foundation."));
  const modules = Object.fromEntries(names.map((n) => [n, JSON.parse(readFileSync(join(base, ...n.split(".")) + ".json", "utf8"))]));
  const t0 = now();
  const project = loadProject({ ...modules, App: appData });
  const state = project.call("App::initial");
  const frame = project.call("App::view", state);
  const valid = project.call(MODEL + "presentationValid", frame);
  const kinds = toArray(frame.nodes).map((n) => n.content.c.split(".").pop());
  return { ms: +(now() - t0).toFixed(1), valid, kinds, labels: toArray(project.call("App::catalogue")).length, missingPrimitives: project.missingPrimitives };
}

// Set up a project the checker can read: the library sources and lexicon, with the spec as its entrypoint.
// The checker's own build directory (.lexlean) is kept between runs, so unchanged library modules are not proved again.
for (const stale of ["src", "data", "language", "report.json"]) rmSync(join(work, stale), { recursive: true, force: true });
mkdirSync(join(work, "src"), { recursive: true });
for (const f of ["lakefile.toml", "lake-manifest.json", "lean-toolchain", "lexlean.toml", ".gitattributes", "build-local.sh", "language", "prismpm.lock"]) {
  if (!existsSync(join(scaffold, f))) { console.error("missing in the scaffold: " + f); process.exit(66); }
  cpSync(join(scaffold, f), join(work, f), { recursive: true });
}
cpSync(join(scaffold, "src/Foundation"), join(work, "src/Foundation"), { recursive: true });
writeFileSync(join(work, "lexlean.toml"), readFileSync(join(work, "lexlean.toml"), "utf8").replace("src/Payment.lex.tex", "src/App.lex.tex"));

const report = { sentence, rounds: [] };
const t0 = now();
let prompt = `${rules}\n\nWrite the module for this app: ${sentence}\n`, source = null, accepted = false;
for (let round = 1; round <= (fromFile ? 1 : 4) && !accepted; round++) {
  const answer = fromFile ? { text: readFileSync(fromFile, "utf8"), firstText: null, total: null, declarations: splitDeclarations(readFileSync(fromFile, "utf8")).complete.map((d) => ({ name: d.name })) } : await ask(prompt);
  source = moduleOf(answer.text);
  const entry = { round, firstTextMs: answer.firstText, modelMs: answer.total, characters: answer.text.length, declarations: answer.declarations };
  const viewAt = answer.declarations.find((d) => d.name === "view");
  if (viewAt) entry.viewDeclaredMs = viewAt.ms;
  report.rounds.push(entry);
  if (!source) { entry.refused = "no module in the answer"; prompt = `${rules}\n\nYour last answer held no module. Write the module for this app: ${sentence}\n`; continue; }
  // Mechanical, not a matter of meaning: the checker wants each list of definitions sorted and without repeats.
  const sorted = source.replace(/(linear_arithmetic\{\s*definitions:\s*\[)([^\]]*)(\])/g, (all, open, names, close) => open + [...new Set(names.split(",").map((n) => n.trim()).filter(Boolean))].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)).join(", ") + close);
  if (sorted !== source) { entry.normalized = "sorted the definition lists of linear_arithmetic proofs"; source = sorted; }
  writeFileSync(join(work, "src/App.lex.tex"), source);
  const checked = await check();
  entry.checkMs = checked.ms; entry.checked = checked.ok;
  if (checked.ok) { accepted = true; break; }
  entry.diagnostics = checked.diagnostics.slice(0, 6);
  prompt = `${rules}\n\nYou wrote this module for the app "${sentence}":\n\n${source}\n\nThe checker refused it:\n${checked.diagnostics.slice(0, 6).join("\n")}\n\nWrite the whole corrected module.\n`;
}
report.accepted = accepted;
if (accepted) {
  try {
    const form = await dataForm(source);
    report.dataFormMs = form.ms;
    mkdirSync(join(work, "data"), { recursive: true });
    cpSync(join(scaffold, "data/Foundation"), join(work, "data/Foundation"), { recursive: true });
    writeFileSync(join(work, "data/App.json"), JSON.stringify(form.data) + "\n");
    const names = JSON.parse(readFileSync(join(scaffold, "data/modules.json"), "utf8")).filter((n) => n.startsWith("Foundation."));
    writeFileSync(join(work, "data/modules.json"), JSON.stringify([...names, "App"]) + "\n");
    report.firstFrame = run(form.data);
    report.promises = promisesOf(form.data);
  } catch (e) { report.runError = e.message.slice(0, 400); }
  // Prove. A wrong axiom list is corrected from what Lean observed and proved again; any other
  // refusal is reported as it is, and its property stays unproved.
  const theorems = splitDeclarations(source).complete.filter((d) => d.kind === "theorem").map((d) => d.name);
  report.proof = { theorems, runs: [] };
  for (let attempt = 1; theorems.length && attempt <= 6; attempt++) {
    const result = await verify();
    const entry = { ms: result.ms, ok: result.ok };
    report.proof.runs.push(entry);
    if (result.ok) { report.proof.attestation = result.attestation ?? newestAttestation(); break; }
    const fix = result.diagnostics.map((d) => /`[\w.]*\.(\w+)` violates its .* axiom policy: observed \[([^\]]*)\]/.exec(d)).find(Boolean);
    if (!fix) { entry.diagnostics = result.diagnostics.slice(0, 6); break; }
    // Lean names one wrong list per run, and a run takes minutes. Theorems closed by the same proof
    // form usually need the same axioms, so the observed set is tried on those too; a wrong guess is
    // refused and corrected by the next run, never accepted.
    const declared = splitDeclarations(source).complete;
    const form = (d) => /proof:\s*([a-z_]+)/.exec(d.source)?.[1];
    const first = declared.find((d) => d.name === fix[1]);
    const alike = first?.kind === "theorem" ? declared.filter((d) => d.kind === "theorem" && form(d) === form(first)).map((d) => d.name) : [fix[1]];
    for (const theorem of alike) source = setAxioms(source, theorem, fix[2]);
    entry.axiomsCorrected = `${alike.join(", ")}: [${fix[2]}]`;
    writeFileSync(join(work, "src/App.lex.tex"), source);
  }
  report.proof.proved = !!report.proof.attestation;
  // Verify formats the source first, so the proved bytes are the ones on disk now.
  if (report.proof.proved) cpSync(join(work, "src/App.lex.tex"), join(work, "App.verified.lex.tex"));
}
report.totalMs = Math.round(now() - t0);
report.preview = `shell/app.html?data=../loop/work/${name}/data/&entry=App`;
writeFileSync(join(work, "report.json"), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(report, null, 1));
process.exit(accepted && report.firstFrame?.valid ? 0 : 1);
