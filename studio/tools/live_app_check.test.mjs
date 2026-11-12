// Run: node --test studio/tools/live_app_check.test.mjs
// A stateful app's module is checked at the end of its turn (shell/live/app.mjs, checkApp), and what the
// chat says about it claims no more than the check found. The hosted service is asked only when
// LIVE_APP_HOSTED=1; the other claims use a stand-in that answers as the service does.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { appLive, card, checkApp, checkLibrary, issueLine, repairPrompt, wholePrefix, splitDeclarations, CARD } from "../shell/live/app.mjs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const module = read("../../v2/loop/answers/guests-3.verified.lex.tex");
const engine = (path) => Promise.resolve(read("../shell/live/v2/" + path));
const library = () => checkLibrary(engine);
const hosted = process.env.LIVE_APP_HOSTED === "1";

// Answers a draft write, a check and a data read. `verdict(files)` gives the check's result.
function service(verdict) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body), args = request.params.arguments;
    let payload = {};
    if (request.params.name === "lexlean_draft_write") { sent.push(args.files); payload = { draft: "prism-app/test" }; }
    else if (request.params.name === "lexlean_check") payload = verdict(sent.at(-1));
    else payload = { data: { spec: "lexlean/semantic-module/2", declarations: [] } };
    return { ok: true, status: 200, json: async () => ({ result: { structuredContent: payload } }) };
  };
  return { fetchImpl, sent };
}

test("the checker is sent the module as written and the one library module it imports", async () => {
  const { fetchImpl, sent } = service(() => ({ success: true, diagnostics: [] }));
  const verdict = await checkApp(module, library(), fetchImpl);
  assert.deepEqual({ ok: verdict.ok, issues: verdict.issues }, { ok: true, issues: [] });
  const paths = sent[0].map((f) => f.path).sort();
  assert.deepEqual(paths, ["src/App.lex.tex", "src/Foundation/View/Browser/V1/Model.lex.tex"]);
  const app = sent[0].find((f) => f.path === "src/App.lex.tex").content;
  const strip = (s) => s.replace(/\\title\{[^}]*\}/, "");
  assert.equal(strip(app), strip(module.trim() + "\n"), "nothing but the title's words differs from what the model wrote");
});

test("a refusal becomes lines about the module as written, and a repair request made of them", async () => {
  const { fetchImpl } = service(() => ({ success: false, diagnostics: [{ code: "LLT4001", severity: "error", message: "unknown name `gests`", primary: { path: "src/App.lex.tex", line_start: 41, column_start: 9 } }] }));
  const verdict = await checkApp(module, library(), fetchImpl);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.issues, ["Line 41: unknown name `gests` (LLT4001)"]);
  const prompt = repairPrompt(verdict.issues);
  assert.match(prompt, /Line 41: unknown name `gests`/);
  assert.match(prompt, /whole module again, in one <prism-lexlean> block/);
  assert.equal(issueLine({ message: "no position" }), "no position");
});

test("a refusal with no reason is still a refusal, and an unreachable service is not a verdict", async () => {
  const silent = service(() => ({ success: false, diagnostics: [] }));
  assert.deepEqual((await checkApp(module, library(), silent.fetchImpl)).issues, ["The checker refused the module and gave no reason."]);
  await assert.rejects(checkApp(module, library(), async () => { throw new Error("offline"); }), /offline/);
});

test("the card says checked only for a checked state, lists what was refused, and never says proved", () => {
  const checked = card({ phase: "checked", issues: [] });
  assert.match(checked, /^\*\*App\*\* · checked/);
  assert.match(checked, /not proved yet/);
  const refused = card({ phase: "drafting", issues: ["Line 41: unknown name `gests` (LLT4001)"] });
  assert.match(refused, /^\*\*App\*\* · not checked/);
  assert.match(refused, /- Line 41: unknown name/);
  const unreachable = card({ phase: "drafting", issues: [], unchecked: "offline" });
  assert.ok(unreachable.startsWith(CARD) && /could not be checked just now: offline/.test(unreachable));
  for (const text of [checked, refused, unreachable]) assert.ok(!/\bproved by\b|is proved|are proved/i.test(text));
});

test("the same module under a new standing is sent again with the new badge, and asks the service nothing", async () => {
  const whole = JSON.parse(read("../../v2/loop/answers/guests-3.json"));
  const calls = [], posted = [];
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body); calls.push(request.params.name);
    const payload = request.params.name === "lexlean_draft_write" ? { draft: "d" } : { data: { spec: whole.spec, declarations: whole.declarations.filter((d) => d.kind !== "theorem") } };
    return { ok: true, status: 200, json: async () => ({ result: { structuredContent: payload } }) };
  };
  const live = appLive({ post: (appId, m) => posted.push(m), library: { "Foundation.View.Browser.V1.Model": JSON.parse(read("../shell/live/v2/Model.json")) }, fetchImpl });
  live.push(4, module, "draft"); await live.settled(4);
  const asked = calls.length;
  live.push(4, module, "checked"); await live.settled(4);
  assert.equal(calls.length, asked);
  assert.deepEqual(posted.map((m) => m.trust), ["draft", "checked"]);
  assert.deepEqual(posted[1].nodes, posted[0].nodes);
});

test("hosted: the service accepts the model-written module and refuses a planted fault by name", { skip: !hosted }, async () => {
  const good = await checkApp(module, library());
  assert.deepEqual({ ok: good.ok, issues: good.issues }, { ok: true, issues: [] });
  // The fault: the helper `cleared` takes a state of a type that does not exist.
  const source = module.replace(/(name: cleared,\s+parameters: \[state : )State\]/, "$1Stat]");
  assert.notEqual(source, module, "the fault was planted");
  const bad = await checkApp(source, library());
  assert.equal(bad.ok, false);
  // The checker names what is wrong. For a fault found while linking it gives the module's line, not
  // the declaration's, so the name in the message is what a model or a person can act on.
  assert.ok(bad.issues.length > 0 && /^Line \d+: /.test(bad.issues[0]) && /`Stat`/.test(bad.issues[0]), bad.issues[0]);
  assert.ok(wholePrefix(source).ready && splitDeclarations(source).declarations.length > 5, "a refused module still runs as far as it can");
});
