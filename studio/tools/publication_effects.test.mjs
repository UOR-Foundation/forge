import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { requestBody, publicationDelay } from "../shell/publication-effects.mjs";
// Load the actual browser module as ESM under both Node 22 and Node 24, retaining
// its real dependency URL. No mock implementation of the GitHub adapter is used.
const url = new URL("../shell/github-build.js", import.meta.url);
const source = fs.readFileSync(url, "utf8").replace('"./publication-effects.mjs"', JSON.stringify(new URL("../shell/publication-effects.mjs", import.meta.url).href)).replace('"./publication-identity.mjs"', JSON.stringify(new URL("../shell/publication-identity.mjs", import.meta.url).href));
const { gitHub, buildOnGitHub } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const response = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const fails = (promise, code) => assert.rejects(promise, { code });

test("pre-cancelled requests make no network call", async () => {
  const controller = new AbortController(); controller.abort();
  await fails(requestBody("https://example.test", {}, { signal: controller.signal, fetch: () => assert.fail("network after cancellation") }), "cancelled");
});
test("invalid deadlines refuse before network", async () => {
  for (const timeoutMs of [0, -1, Infinity, NaN, 2147483648]) {
    await fails(requestBody("https://example.test", {}, { timeoutMs, fetch: () => assert.fail("invalid deadline sent request") }), "invalidDeadline");
  }
});
test("a stalled request times out and aborts its fetch signal", async () => {
  let requestSignal;
  await fails(requestBody("https://example.test", {}, { timeoutMs: 10, fetch: (_, options) => { requestSignal = options.signal; return new Promise(() => {}); } }), "timedOut");
  assert.equal(requestSignal.aborted, true);
});
test("a stalled response body is also bounded", async () => {
  await fails(requestBody("https://example.test", {}, { timeoutMs: 10, fetch: async () => ({ text: () => new Promise(() => {}) }) }), "timedOut");
});
test("cancellation interrupts active requests without exposing the reason", async () => {
  const controller = new AbortController(); let requestSignal;
  const request = requestBody("https://example.test", {}, { signal: controller.signal, fetch: (_, options) => { requestSignal = options.signal; controller.abort("private reason"); return new Promise(() => {}); } });
  await fails(request, "cancelled");
  assert.equal(requestSignal.aborted, true);
});
test("network and body failures are typed without credential or body disclosure", async () => {
  for (const fetch of [async () => { throw Error("secret"); }, async () => ({ text() { throw Error("secret"); } })]) {
    await assert.rejects(requestBody("https://example.test", {}, { fetch }), error => error.code === "networkFailed" && !error.message.includes("secret"));
  }
});
test("normal reads retain status and content", async () => {
  const result = await requestBody("https://example.test", {}, { fetch: async () => response("ok", 202) });
  assert.equal(result.response.status, 202); assert.equal(result.body, "ok");
});
test("polling cancellation settles promptly even with a stalled injected delay", async () => {
  const controller = new AbortController();
  const delay = publicationDelay(15000, { signal: controller.signal, sleep: () => new Promise(() => {}) });
  controller.abort(); await fails(delay, "cancelled");
  await fails(publicationDelay(1, { signal: controller.signal, sleep: () => assert.fail("sleep after cancellation") }), "cancelled");
});
test("GitHub preserves successful JSON, raw content and typed HTTP refusal", async () => {
  const gh = gitHub("private-token", { fetch: async (_, options) => {
    assert.equal(options.headers.Authorization, "Bearer private-token");
    return response({ login: "user" });
  } });
  assert.deepEqual(await gh.get("/user"), { login: "user" });
  assert.equal(await gh.raw("/file"), '{"login":"user"}');
  const denied = gitHub("private-token", { fetch: async () => response({ message: "private response" }, 403) });
  await assert.rejects(denied.get("/user"), e => e.code === "httpRejected" && e.status === 403 && !e.message.includes("private"));
});
test("successful malformed GitHub JSON refuses instead of becoming null", async () => {
  await fails(gitHub("token", { fetch: async () => response("not json") }).get("/user"), "malformedResponse");
});
test("cancelling the actual build before commit prevents further remote writes", async () => {
  const controller = new AbortController(); const calls = [];
  const fetch = async (url, options) => {
    calls.push([String(url), options.method]);
    if (String(url).endsWith("/user")) return response({ login: "user" });
    if (String(url).endsWith("/git/ref/heads/main")) return response({ object: { sha: "head" } });
    return response({});
  };
  await fails(buildOnGitHub({ token: "token", spec: { name: "app", purpose: "test" }, fetch, signal: controller.signal,
    step: word => { if (word === "Writing the app") controller.abort(); },
    templateCommit: () => assert.fail("commit after cancellation"), open: () => assert.fail("live verification after cancellation") }), "cancelled");
  assert.equal(calls.length, 4);
  assert.equal(calls.some(([url]) => url.includes("/git/commits")), false);
});
test("the UI passes its cancellation signal to the actual build", () => {
  const host = fs.readFileSync(new URL("../shell/host.js", import.meta.url), "utf8");
  assert.match(host, /buildOnGitHub\(\{[^\n]+signal: abort\.signal \}\)/);
  assert.match(host, /Work already submitted to GitHub may continue/);
  assert.match(source, /if \(error\?\.code === "cancelled"\) throw error/);
  assert.match(source, /fetchLive\(live, open, \{ fetch, sleep: gh\.sleep, signal, timeoutMs \}\)/);
});
