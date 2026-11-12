// Run: node --test studio/tools/live_app.test.mjs
// The live preview of a stateful app (shell/live/app.mjs): a module in the app shape, streamed, becomes
// frames. The data forms come from fixtures, so the suite needs no network; one test, skipped unless
// LIVE_APP_HOSTED=1, asks the hosted service and compares its answer with the fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isAppShape, moduleFromTurn, splitDeclarations, wholePrefix, createApp, appLive, dataForm } from "../shell/live/app.mjs";

import { describeHostedSource } from "../shell/hosted-source-permission.mjs";
// Explicit fixture authorization. No test uses implicit production consent.
const permissionOptions = { authorize: async input => ({ disclosure: describeHostedSource(input), expires: Date.now() + 10000, signal: new AbortController().signal, close() {} }), online: () => true };
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const module = read("../../v2/loop/answers/guests-3.verified.lex.tex");
const decision = read("../../app/src/ForgeKernel.lex.tex");
const library = { "Foundation.View.Browser.V1.Model": JSON.parse(read("../shell/live/v2/Model.json")) };
const whole = JSON.parse(read("../../v2/loop/answers/guests-3.json"));

// A hosted service stand-in: answers a draft's data form from the declarations the draft holds, so a
// partial module gets a partial data form, as the real service gives.
function service() {
  const calls = [], drafts = new Map();
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body), args = request.params.arguments;
    calls.push(request.params.name);
    let payload;
    if (request.params.name === "lexlean_draft_write") { const id = "prism-app/" + drafts.size; drafts.set(id, args.files[0].content); payload = { draft: id }; }
    else { const names = new Set(splitDeclarations(drafts.get(args.draft)).declarations.map((d) => d.name)); payload = { data: { spec: whole.spec, declarations: whole.declarations.filter((d) => names.has(d.name)) } }; }
    return { ok: true, json: async () => ({ result: { structuredContent: payload } }) };
  };
  return { fetchImpl, calls };
}

test("the app shape is told from the decision shape", () => {
  assert.equal(isAppShape(module), true);
  assert.equal(isAppShape(module.slice(0, 400)), true, "from its first lines");
  assert.equal(isAppShape(decision), false);
  assert.equal(isAppShape(""), false);
});

test("a turn's module is found, closed or still being written", () => {
  assert.equal(moduleFromTurn("no module here"), null);
  assert.deepEqual(moduleFromTurn("Here.\n<prism-lexlean>abc"), { text: "abc", closed: false });
  assert.deepEqual(moduleFromTurn("<prism-lexlean>old</prism-lexlean> again <prism-lexlean>new</prism-lexlean> done"), { text: "new", closed: true });
});

test("every prefix of a streamed module splits without error, and a brace inside a string does not end a declaration", () => {
  for (let i = 0; i <= module.length; i += 97) splitDeclarations(module.slice(0, i));
  const tricky = '\\begin{semanticmodule}\ndefinition{\n  name: a,\n  body: "}{ \\" }"\n}\ndefinition{ name: b';
  assert.deepEqual(splitDeclarations(tricky).declarations.map((d) => d.name), ["a"]);
});

test("a module is runnable once State, catalogue, initial and view are whole, and interactive once step is", () => {
  const seen = [];
  for (let i = 0; i <= module.length; i += 53) { const p = wholePrefix(module.slice(0, i)); seen.push(p.ready ? (p.interactive ? "interactive" : "ready") : "waiting"); }
  assert.deepEqual([...new Set(seen)], ["waiting", "ready", "interactive"]);
  const full = wholePrefix(module);
  assert.ok(full.source.endsWith("\\end{lexlean}\n"));
  assert.ok(!/theorem\{/.test(full.source), "theorems are not run and are left out");
});

test("an app runs: frames are plain data, an action moves the state, a stale press does not", () => {
  const app = createApp(whole, library);
  const first = app.frame();
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first, "a frame crosses postMessage unchanged: no BigInt, no function");
  assert.deepEqual(first.nodes.map((n) => n.kind), ["Section", "Heading", "Form", "Input", "Action", "Action", "Table"]);
  const input = first.nodes.findIndex((n) => n.kind === "Input") + 1, add = first.nodes.find((n) => n.kind === "Action").action;
  const second = app.act(add, [{ node: input, text: "Ada" }]);
  assert.deepEqual(second.nodes.find((n) => n.kind === "Table").rows, [["Ada"]]);
  assert.notEqual(second.revision, first.revision);
  assert.notEqual(second.nodes[input - 1].epoch, first.nodes[input - 1].epoch, "the name box is told to empty");
});

test("a streamed module posts a frame as soon as it is runnable, then again when step arrives", async () => {
  const { fetchImpl, calls } = service(), posted = [];
  const live = appLive({ post: (appId, m) => posted.push(m), library, fetchImpl, permissionOptions, now: () => 0 });
  const viewEnd = module.indexOf("definition{\n  name: textOf"), stepEnd = module.indexOf("definition{\n  name: promises");
  assert.ok(viewEnd > 0 && stepEnd > viewEnd);
  assert.equal(live.push(7, module.slice(0, 300)), false, "nothing to run yet");
  assert.equal(live.push(7, module.slice(0, viewEnd)), true);
  await live.settled(7);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, "live/presentation");
  assert.equal(posted[0].app, "7");
  assert.equal(posted[0].interactive, false, "no step yet: the screen is shown, its actions do nothing");
  assert.equal(posted[0].trust, "draft");
  live.push(7, module.slice(0, stepEnd));
  await live.settled(7);
  assert.equal(posted.at(-1).interactive, true);
  const before = calls.length;
  live.push(7, module.slice(0, stepEnd) + "\n\ndefinition{\n  name: half");
  await live.settled(7);
  assert.equal(calls.length, before, "an unfinished declaration asks the service nothing");
});

test("a press in the frame is answered with the next frame; a press from an old frame with the current one", async () => {
  const { fetchImpl } = service(), posted = [];
  const live = appLive({ post: (appId, m) => posted.push(m), library, fetchImpl, permissionOptions });
  live.push(1, module); await live.settled(1);
  const frame = posted.at(-1), input = frame.nodes.findIndex((n) => n.kind === "Input") + 1;
  live.intent(1, { revision: frame.revision, action: 1, fields: [{ node: input, text: "Grace" }] });
  assert.deepEqual(posted.at(-1).nodes.find((n) => n.kind === "Table").rows, [["Grace"]]);
  live.intent(1, { revision: frame.revision, action: 1, fields: [{ node: input, text: "late" }] });
  assert.deepEqual(posted.at(-1).nodes.find((n) => n.kind === "Table").rows, [["Grace"]], "the old frame's press added nothing");
  assert.equal(live.intent(99, { revision: "0", action: 1 }), false, "an app with no frame takes no press");
});

test("a start that does not run keeps the last frame and says why; a service failure is a note, not a crash", async () => {
  const posted = [];
  const broken = async () => ({ json: async () => ({ result: { isError: true, structuredContent: { diagnostics: [{ message: "syntax" }] }, content: [{ text: "x" }] } }) });
  const live = appLive({ post: (appId, m) => posted.push(m), library, fetchImpl: broken, permissionOptions });
  live.push(3, module); await live.settled(3);
  assert.equal(posted.length, 0, "no frame was ever drawn, so none is posted");
  const { fetchImpl } = service();
  const good = appLive({ post: (appId, m) => posted.push(m), library, fetchImpl, permissionOptions });
  good.push(3, module); await good.settled(3);
  assert.equal(posted.length, 1);
  const invalid = { ...whole, declarations: whole.declarations.map((d) => (d.name === "catalogue" ? { ...d, body: { kind: "nil", element: { kind: "string" } } } : d)) };
  assert.throws(() => createApp(invalid, library).frame(), /catalogue|admits/);
});

test("the hosted service gives the data form the fixture holds", { skip: process.env.LIVE_APP_HOSTED !== "1" }, async () => {
  const data = await dataForm(wholePrefix(module).source, undefined, permissionOptions);
  const names = (d) => d.declarations.map((x) => x.name);
  assert.deepEqual(names(data), names(whole).filter((n) => !/^(startsEmpty|clearEmpties|emptyIgnored|longIgnored|staleIgnored)$/.test(n)));
  assert.deepEqual(createApp(data, library).frame().nodes, createApp(whole, library).frame().nodes);
});
