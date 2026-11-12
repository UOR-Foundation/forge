// Run: node --test studio/tools/live_app_tab.test.mjs
// The studio checks a stateful app's module in the tab first (shell/live/app.mjs, appChecker) and through the hosted
// service only while the tab's checker loads or cannot run, and every answer says which. These tests run the files
// the shell serves (shell/live/v2/in-tab/) on the built checker, v2/in-tab-check/dist/lexlean-tab-lean.wasm, which is
// not committed: without it they fail, and none is skipped. The hosted service is never asked: a stand-in answers
// with what the SDK image recorded for each corpus file (v2/hosted-check/image-results.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { appChecker, appLive, card, checkApp, checkLibrary, routeLine } from "../shell/live/app.mjs";
import { serve } from "../shell/live/v2/in-tab/checker.mjs";
import { cases } from "../../v2/hosted-check/corpus.mjs";

const at = (path) => new URL(path, import.meta.url);
const read = (path) => fs.readFileSync(at(path), "utf8");
const bytes = (path) => { const b = fs.readFileSync(at(path)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const manifest = JSON.parse(read("../shell/live/v2/in-tab/checker-lean.json"));
let wasm;
try { wasm = bytes("../../v2/in-tab-check/dist/lexlean-tab-lean.wasm"); }
catch { throw new Error('v2/in-tab-check/dist/lexlean-tab-lean.wasm is absent: build it with "bash v2/in-tab-check/build.sh" (it is not committed)'); }
const pack = () => bytes("../shell/live/v2/in-tab/pack.json");
const image = JSON.parse(read("../../v2/hosted-check/image-results.json")).cases;
const corpus = cases();
const guests = corpus.find((c) => c.id === "guests-2").spec;
const library = () => checkLibrary((path) => Promise.resolve(read("../shell/live/v2/" + path)));

// The hosted service, as it answered before: the verdict and diagnostics recorded for one corpus file.
function service(recorded = { ok: true, diagnostics: [] }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request.params.name);
    let payload = { data: { spec: "lexlean/semantic-module/2", declarations: [] } };
    if (request.params.name === "lexlean_draft_write") payload = { draft: "prism-app/test" };
    else if (request.params.name === "lexlean_check") payload = { success: recorded.ok, diagnostics: recorded.diagnostics.map((d) => ({ code: d.code, severity: "error", message: d.message, primary: { path: d.path, line_start: d.line, column_start: d.column, line_end: d.endLine, column_end: d.endColumn } })) };
    return { ok: true, status: 200, json: async () => ({ result: { structuredContent: payload } }) };
  };
  return { fetchImpl, calls };
}
const never = async () => { throw new Error("a spec was sent to a server"); };

// A worker in this process: the shell's own worker code (serve) behind a pair of message ports. `bound` says whether
// the no-connection policy is in force: under it a fetch is refused and a violation is reported, as a browser does.
function tab({ bound = true, checker = wasm, hold = null, trap = () => false, store = null, failures = 0 } = {}) {
  const sent = [];
  let fetches = 0;
  const makeWorker = () => {
    const listeners = [];
    const scope = {
      addEventListener: (type, fn) => listeners.push(fn),
      postMessage: (m) => queueMicrotask(() => worker.onmessage?.({ data: m })),
      fetch: async () => { if (!bound) return { ok: true }; for (const fn of listeners) fn({}); throw new TypeError("Failed to fetch"); },
      location: { href: "https://tab.test/live/v2/in-tab/worker.mjs" },
    };
    serve(scope);
    const worker = {
      postMessage(m) {
        if (m.type) sent.push(m.type);
        if (m.type === "check" && trap(m.spec)) return queueMicrotask(() => worker.onmessage({ data: { id: m.id, error: { code: "ITC_TRAP", message: "the checker stopped: unreachable" } } }));
        queueMicrotask(() => scope.onmessage({ data: m }));
      },
      terminate() { worker.terminated = true; },
    };
    return worker;
  };
  return { sent, parts: async () => { await hold; return { manifest, makeWorker, bytesOf: async (name) => { if (name === "checker" && ++fetches <= failures) throw Object.assign(new Error("the checker could not be fetched"), { code: "ITC_FETCH" }); return name === "checker" ? checker.slice(0) : pack(); }, store, probe: true }; }, fetches: () => fetches };
}

test("in the tab, each corpus file gets the verdict, the issues and the result shape the hosted route gave", async () => {
  const t = tab(), checker = appChecker({ library, fetchImpl: never, tab: t.parts });
  assert.equal(await checker.start(), true);
  assert.equal(corpus.length, 17);
  for (const c of corpus) {
    const before = await checkApp(c.spec, library(), service(image[c.id]).fetchImpl, c.extras);
    const now = await checker.check(c.spec, { extras: c.extras });
    assert.deepEqual({ ok: now.ok, issues: now.issues }, { ok: before.ok, issues: before.issues }, c.id);
    assert.equal(now.ok, image[c.id].ok, c.id);
    assert.deepEqual(Object.keys(now).filter((k) => k in before).sort(), Object.keys(before).sort(), c.id);
    assert.equal(typeof now.ms, "number");
    assert.equal(now.by.route, "in-tab", c.id);
    assert.equal(!!now.data, now.ok, "a pass carries the data form, a refusal none: " + c.id);
  }
});

test("while the tab's checker loads the hosted service answers and says so; once ready the tab answers and no spec leaves", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const hosted = service(), t = tab({ hold });
  const states = [];
  const checker = appChecker({ library, fetchImpl: hosted.fetchImpl, tab: t.parts, onState: (s) => states.push(s) });
  const early = await checker.check(guests);
  assert.equal(early.ok, true);
  assert.deepEqual({ route: early.by.route, instead: early.by.instead.code }, { route: "hosted", instead: "ITC_NOT_LOADED" });
  assert.equal(routeLine(early.by), "Checked by the hosted service while the checker in this tab loads.");
  assert.ok(hosted.calls.includes("lexlean_check"));
  release();
  assert.equal(await checker.start(), true);
  assert.deepEqual(states, ["loading", "ready"]);
  const asked = hosted.calls.length;
  const later = await checker.check(guests);
  assert.equal(later.by.route, "in-tab");
  assert.equal(routeLine(later.by), "Checked in this tab.");
  assert.deepEqual({ lexlean: later.by.lexlean, semantics: later.by.semantics, checker: later.by.checker }, { lexlean: manifest.lexlean.version, semantics: manifest.lexlean.semantics, checker: manifest.checker });
  assert.equal(hosted.calls.length, asked, "the hosted service is not asked once the tab is ready");
});

test("a checker whose bytes are not the manifest's never runs: the hosted service answers, with the reason", async () => {
  const other = wasm.slice(0);
  new Uint8Array(other)[other.byteLength - 1] ^= 1;
  const hosted = service(image["guests-3"]), t = tab({ checker: other });
  const checker = appChecker({ library, fetchImpl: hosted.fetchImpl, tab: t.parts });
  assert.equal(await checker.start(), false);
  assert.equal(checker.state(), "unavailable");
  const verdict = await checker.check(corpus.find((c) => c.id === "guests-3").spec);
  assert.equal(verdict.ok, false, "the verdict is the hosted route's, not a pass");
  assert.deepEqual({ route: verdict.by.route, instead: verdict.by.instead.code }, { route: "hosted", instead: "ITC_ADDRESS" });
  assert.match(routeLine(verdict.by), /^Checked by the hosted service, because the checker in this tab could not run: the checker's bytes are sha256:[0-9a-f]{64}, not sha256:11b9a6ca[0-9a-f]{56} \(ITC_ADDRESS\)$/);
  assert.ok(!t.sent.includes("check") && !t.sent.includes("warm"));
});

test("a checker that stops mid-check is answered by the hosted service with the reason, and the next check is in the tab", async () => {
  const hosted = service(), t = tab({ trap: (spec) => spec.includes("% trap") });
  const checker = appChecker({ library, fetchImpl: hosted.fetchImpl, tab: t.parts });
  await checker.start();
  const stopped = await checker.check(guests + "% trap\n");
  assert.deepEqual({ route: stopped.by.route, instead: stopped.by.instead.code }, { route: "hosted", instead: "ITC_TRAP" });
  assert.match(routeLine(stopped.by), /could not run: the checker stopped: unreachable \(ITC_TRAP\)$/);
  assert.equal((await checker.check(guests)).by.route, "in-tab");
});

test("a failure that can pass is tried again, once a period; a refusal is not", async () => {
  let clock = 0;
  const hosted = service(), t = tab({ failures: 1 });
  const checker = appChecker({ library, fetchImpl: hosted.fetchImpl, tab: t.parts, retryMs: 1000, now: () => clock });
  assert.equal(await checker.start(), false);
  const first = await checker.check(guests);
  assert.deepEqual({ route: first.by.route, instead: first.by.instead.code }, { route: "hosted", instead: "ITC_FETCH" });
  assert.equal(t.fetches(), 1, "not tried again within the period");
  clock = 1000;
  assert.equal((await checker.check(guests)).by.route, "hosted");
  assert.equal(await checker.start(), true, "the check after the period started the tab's checker again");
  assert.equal((await checker.check(guests)).by.route, "in-tab");
  const other = wasm.slice(0, wasm.byteLength - 1), refused = tab({ checker: other });
  const final = appChecker({ library, fetchImpl: hosted.fetchImpl, tab: refused.parts, retryMs: 0, now: () => clock });
  await final.start();
  await final.check(guests); await final.check(guests);
  assert.equal(refused.fetches(), 1, "refused bytes are not fetched again");
});

test("a worker that could open a connection is handed nothing and is not used", async () => {
  const hosted = service(), t = tab({ bound: false });
  const checker = appChecker({ library, fetchImpl: hosted.fetchImpl, tab: t.parts });
  assert.equal(await checker.start(), false);
  assert.deepEqual(t.sent, ["probe"], "neither the checker's bytes nor a spec reached the worker");
  const verdict = await checker.check(guests);
  assert.deepEqual({ route: verdict.by.route, instead: verdict.by.instead.code }, { route: "hosted", instead: "ITC_POLICY" });
});

test("with `only: \"in-tab\"` no spec is sent to a server in any state", async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const loading = appChecker({ library, fetchImpl: never, tab: tab({ hold }).parts });
  const waited = loading.check(guests, { only: "in-tab" });
  release();
  assert.equal((await waited).by.route, "in-tab");
  const other = wasm.slice(0, wasm.byteLength - 1);
  const unavailable = appChecker({ library, fetchImpl: never, tab: tab({ checker: other }).parts });
  await assert.rejects(unavailable.check(guests, { only: "in-tab" }), { code: "ITC_ADDRESS" });
  const stopping = appChecker({ library, fetchImpl: never, tab: tab({ trap: () => true }).parts });
  await assert.rejects(stopping.check(guests, { only: "in-tab" }), { code: "ITC_TRAP" });
  await assert.rejects(stopping.data(guests, { only: "in-tab" }).then(() => unavailable.data(guests, { only: "in-tab" })), { code: "ITC_ADDRESS" });
  const absent = appChecker({ library, fetchImpl: never });
  await assert.rejects(absent.check(guests, { only: "in-tab" }), { code: "ITC_ABSENT" });
});

test("a result kept by the page is reused by a new worker, and one that was altered is not believed", async () => {
  const kept = new Map(), store = { get: async (key) => kept.get(key) ?? null, put: async (key, value) => { kept.set(key, value); } };
  const refused = corpus.find((c) => c.id === "guests-3").spec;
  const first = appChecker({ library, fetchImpl: never, tab: tab({ store }).parts });
  const only = { only: "in-tab" };
  assert.equal((await first.check(refused, only)).cached, false);
  assert.equal(kept.size, 1);
  const second = appChecker({ library, fetchImpl: never, tab: tab({ store }).parts });
  const again = await second.check(refused, only);
  assert.deepEqual({ ok: again.ok, cached: again.cached }, { ok: false, cached: "store" });
  // The planted fault: the stored refusal is turned into a pass without its recorded address.
  const [key, text] = [...kept][0], entry = JSON.parse(text);
  kept.set(key, JSON.stringify({ ...entry, value: JSON.stringify({ ok: true, exit: 0, diagnostics: [], data: {} }) }));
  const third = appChecker({ library, fetchImpl: never, tab: tab({ store }).parts });
  const checked = await third.check(refused, only);
  assert.deepEqual({ ok: checked.ok, cached: checked.cached }, { ok: false, cached: false });
  // A store that fails is an empty store, never a failed check.
  const broken = { get: async () => { throw new Error("no storage"); }, put: async () => { throw new Error("no storage"); } };
  assert.equal((await appChecker({ library, fetchImpl: never, tab: tab({ store: broken }).parts }).check(refused, only)).ok, false);
});

test("the preview runs from the tab's data form with no server, and from a check's own data with no call at all", async () => {
  const module = read("../../v2/loop/answers/guests-3.verified.lex.tex");
  const model = { "Foundation.View.Browser.V1.Model": JSON.parse(read("../shell/live/v2/Model.json")) };
  const checker = appChecker({ library, fetchImpl: never, tab: tab().parts });
  await checker.start();
  let asked = 0;
  const posted = [];
  const live = appLive({ post: (appId, m) => posted.push(m), library: model, fetchImpl: never, dataOf: async (source) => { asked++; return (await checker.data(source, { only: "in-tab" })).data; } });
  live.push(7, module, "draft"); await live.settled(7);
  assert.equal(asked, 1);
  assert.equal(posted.length, 1);
  assert.ok(posted[0].nodes.length > 0 && posted[0].note === null, posted[0].note);
  // A module that does not check still has a data form when it parses, so a draft is drawn as before.
  const draft = module.replace(/(name: cleared,\s+parameters: \[state : )State\]/, "$1Stat]");
  assert.notEqual(draft, module);
  assert.equal((await checker.check(draft)).ok, false);
  assert.ok((await checker.data(draft)).data.declarations.length > 5);
  // A pass hands its data form to the preview: a fresh preview draws the same frame and asks nothing.
  const verdict = await checker.check(module);
  assert.equal(verdict.ok, true);
  const fresh = [];
  const second = appLive({ post: (appId, m) => fresh.push(m), library: model, fetchImpl: never, dataOf: never });
  second.push(8, module, "checked", verdict.data.App); await second.settled(8);
  assert.deepEqual(fresh.map((m) => m.trust), ["checked"]);
  assert.deepEqual(fresh[0].nodes, posted[0].nodes);
});

test("the card says which route checked the module, and what was not sent when nothing may be", () => {
  const inTab = { route: "in-tab", lexlean: "0.3.0" }, loading = { route: "hosted", instead: { code: "ITC_NOT_LOADED", message: "the checker in this tab is loading" } };
  assert.match(card({ phase: "checked", issues: [], by: inTab }), /^\*\*App\*\* · checked\n\n[^\n]+\n\nChecked in this tab\.$/);
  assert.match(card({ phase: "checked", issues: [], by: loading }), /\n\nChecked by the hosted service while the checker in this tab loads\.$/);
  assert.match(card({ phase: "drafting", issues: ["Line 8: unknown name (LLT4001)"], by: inTab }), /^\*\*App\*\* · not checked[\s\S]+Checked in this tab\.\n\nIt still runs/);
  assert.equal(routeLine({ route: "hosted" }), "Checked by the hosted service.");
  assert.equal(routeLine(undefined), "");
  assert.ok(!/hosted|this tab/.test(card({ phase: "checked", issues: [] })), "a state from before routes were recorded claims none");
  for (const by of [inTab, loading]) assert.ok(!/\bproved by\b|is proved|are proved/i.test(card({ phase: "checked", issues: [], by })));
});

// ---- the service worker's part (shell/sw.template.js), run here against stand-ins for its globals
import vm from "node:vm";
import { createHash } from "node:crypto";

// Loads the worker's script and answers one request through its own fetch handler. `served(path)` is what the
// static host answers; the closure lists the hashes of `listed`.
async function throughWorker(path, { listed, served }) {
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const manifest = { closure: "test", files: Object.entries(listed).map(([p, b]) => ({ path: p, sha256: sha(b), bytes: b.length })) };
  const kept = new Map(), handlers = {};
  const cache = { match: async (key) => kept.get(String(key.url ?? key))?.clone(), put: async (key, r) => { kept.set(String(key.url ?? key), r); }, addAll: async () => {} };
  const fetchImpl = async (request) => {
    const p = new URL(request.url ?? request, "https://studio.test/foundry/").pathname.slice("/foundry/".length);
    if (p === "manifest.json") return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } });
    const bytes = served(p);
    return bytes ? new Response(bytes, { headers: { "content-type": "text/javascript" } }) : new Response("", { status: 404 });
  };
  const self = { registration: { scope: "https://studio.test/foundry/" }, location: { origin: "https://studio.test" }, addEventListener: (type, fn) => { handlers[type] = fn; }, clients: {} };
  const globals = { self, importScripts() {}, caches: { open: async () => cache, match: async (key) => cache.match(key), keys: async () => [] }, fetch: fetchImpl, crypto, URL, Request: class { constructor(url, init) { this.url = String(url); Object.assign(this, init); } }, Response, Headers, TextEncoder, ReadableStream, MessageChannel, indexedDB: {}, console };
  vm.runInNewContext(read("../shell/sw.template.js"), globals);
  let answer = null;
  handlers.fetch({ request: { url: "https://studio.test/foundry/" + path, method: "GET", mode: "same-origin" }, respondWith: (p) => { answer = p; }, waitUntil() {} });
  return { response: answer && (await answer), kept };
}

test("the service worker answers the checker's worker with a policy that allows no connection, and only with this closure's bytes", async () => {
  const worker = fs.readFileSync(at("../shell/live/v2/in-tab/worker.mjs")), manifestBytes = fs.readFileSync(at("../shell/live/v2/in-tab/checker-lean.json"));
  const listed = { "live/v2/in-tab/worker.mjs": worker, "live/v2/in-tab/checker-lean.json": manifestBytes };
  const good = await throughWorker("live/v2/in-tab/worker.mjs", { listed, served: (p) => listed[p] });
  assert.equal(good.response.status, 200);
  assert.equal(good.response.headers.get("content-security-policy"), "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'");
  assert.deepEqual(Buffer.from(await good.response.arrayBuffer()), worker);
  // Answered a second time from what was kept, the policy is still there.
  const plain = await throughWorker("live/v2/in-tab/checker-lean.json", { listed, served: (p) => listed[p] });
  assert.equal(plain.response.status, 200);
  assert.equal(plain.response.headers.get("content-security-policy"), null, "only the worker's script carries the policy");
  // The planted fault: the host serves a worker script, or a manifest, that is not the closure's.
  for (const path of Object.keys(listed)) {
    const altered = await throughWorker(path, { listed, served: (p) => Buffer.concat([listed[p], Buffer.from("\n// altered\n")]) });
    assert.equal(altered.response.status, 409, path);
    assert.equal(altered.kept.size, 0, "nothing that was refused is kept");
  }
  const unlisted = await throughWorker("live/v2/in-tab/wasi.mjs", { listed, served: () => Buffer.from("export {};") });
  assert.equal(unlisted.response.status, 409, "a file the closure does not list is refused too");
  // The checker's own bytes are not the worker's to answer: the page fetches them by address and verifies them.
  assert.equal((await throughWorker("checker/sha256-00.wasm", { listed, served: () => null })).response, null);
});
