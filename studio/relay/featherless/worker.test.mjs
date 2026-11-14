// The relay's rules, against a stand-in for Featherless: node --test studio/relay/featherless/worker.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import worker, { shape } from "./worker.mjs";

const ORIGIN = "https://uor-foundation.github.io";
const env = (over = {}) => ({ FEATHERLESS_KEY: "test-key", ALLOWED_ORIGINS: ORIGIN, MODELS: "zai-org/GLM-5.3-Flash", MAX_TOKENS: "32768", ...over });
const body = (over = {}) => ({ model: "zai-org/GLM-5.3-Flash", messages: [{ role: "user", content: "hi" }], stream: true, max_tokens: 1000, ...over });
const post = (b, headers = {}) =>
  new Request("https://relay.test/v1/chat/completions", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });

// The stand-in: records what reached Featherless and answers as told.
function upstream(answer = () => new Response("data: {}\n\ndata: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return answer(); };
  return calls;
}

test("a site request reaches Featherless with the site's key and streams back", async () => {
  const calls = upstream();
  const res = await worker.fetch(post(body()), env());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.match(await res.text(), /\[DONE\]/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.featherless.ai/v1/chat/completions");
  assert.equal(calls[0].init.headers.authorization, "Bearer test-key");
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.stream_options, { include_usage: true });
});

test("another origin, no origin, another path or another method never reaches Featherless", async () => {
  const calls = upstream();
  assert.equal((await worker.fetch(post(body(), { origin: "https://evil.example" }), env())).status, 403);
  const noOrigin = new Request("https://relay.test/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body()) });
  assert.equal((await worker.fetch(noOrigin, env())).status, 403);
  assert.equal((await worker.fetch(new Request("https://relay.test/v1/models", { headers: { origin: ORIGIN } }), env())).status, 404);
  assert.equal((await worker.fetch(new Request("https://relay.test/v1/chat/completions", { headers: { origin: ORIGIN } }), env())).status, 405);
  assert.equal(calls.length, 0);
});

test("the preflight answers only the site", async () => {
  upstream();
  const ok = await worker.fetch(new Request("https://relay.test/v1/chat/completions", { method: "OPTIONS", headers: { origin: ORIGIN } }), env());
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), ORIGIN);
  const no = await worker.fetch(new Request("https://relay.test/v1/chat/completions", { method: "OPTIONS", headers: { origin: "https://evil.example" } }), env());
  assert.equal(no.status, 403);
});

test("only an offered model, real messages and JSON are forwarded", async () => {
  const calls = upstream();
  assert.equal((await worker.fetch(post(body({ model: "some/expensive-model" })), env())).status, 400);
  assert.equal((await worker.fetch(post(body({ messages: [] })), env())).status, 400);
  assert.equal((await worker.fetch(post(body({ messages: [{ role: "tool", content: "x" }] })), env())).status, 400);
  assert.equal((await worker.fetch(post(body({ messages: [{ role: "user", content: [{ type: "image_url", image_url: "x" }] }] })), env())).status, 400);
  assert.equal((await worker.fetch(post("not json"), env())).status, 400);
  assert.equal((await worker.fetch(post(body(), { "content-type": "text/plain" }), env())).status, 415);
  assert.equal(calls.length, 0);
});

test("a request over 2 MiB is refused", async () => {
  const calls = upstream();
  const big = body({ messages: [{ role: "user", content: "x".repeat(2 * 1024 * 1024 + 1) }] });
  assert.equal((await worker.fetch(post(big), env())).status, 413);
  assert.equal(calls.length, 0);
});

test("a second offered model is forwarded, and one not offered is refused", () => {
  const two = env({ MODELS: "zai-org/GLM-5.3-Flash,deepseek-ai/DeepSeek-V3.2" });
  assert.equal(shape(body({ model: "deepseek-ai/DeepSeek-V3.2" }), two).model, "deepseek-ai/DeepSeek-V3.2");
  assert.throws(() => shape(body({ model: "deepseek-ai/DeepSeek-V3.2" }), env()), /not offered/);
  assert.throws(() => shape(body({ model: "google/gemma-4-31B-it" }), two), /not offered/);
});

test("the answer's length is capped and unknown fields are dropped", () => {
  const out = shape(body({ max_tokens: 10_000_000, tools: [{}], provider: { x: 1 }, n: 5, temperature: "0.7", user: "someone" }), env());
  assert.equal(out.max_tokens, 32768);
  assert.equal(out.temperature, 0.7);
  for (const f of ["tools", "provider", "n", "user"]) assert.equal(f in out, false);
  assert.equal(shape(body({ max_tokens: undefined }), env()).max_tokens, 32768);
});

test("the thinking switch is never forwarded: with it off GLM deliberates in the answer instead", () => {
  for (const kw of [{ enable_thinking: false }, { enable_thinking: true }]) for (const e of [env(), env({ FORWARD_THINKING_OFF: "1" }), env({ FORWARD_RESPONSE_FORMAT: "1" })]) assert.equal("chat_template_kwargs" in shape(body({ chat_template_kwargs: kw }), e), false);
});

test("a response schema is not forwarded unless its switch is on, and then only one bounded JSON schema", () => {
  const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false };
  const format = { type: "json_schema", json_schema: { name: "prism_spec_1", schema, strict: false, extra: 1 } };
  assert.equal("response_format" in shape(body({ response_format: format }), env()), false);
  const on = env({ FORWARD_RESPONSE_FORMAT: "1" });
  assert.deepEqual(shape(body({ response_format: format }), on).response_format, { type: "json_schema", json_schema: { name: "prism_spec_1", schema, strict: true } });
  const big = { type: "object", description: "x".repeat(9000) };
  for (const bad of [{ type: "json_object" }, { type: "json_schema" }, { type: "json_schema", json_schema: { name: "has space", schema } }, { type: "json_schema", json_schema: { name: "s", schema: [] } }, { type: "json_schema", json_schema: { name: "s", schema: big } }, "json", null])
    assert.equal("response_format" in shape(body({ response_format: bad }), on), false);
});

test("a visitor over the per-minute limit is refused before Featherless", async () => {
  const calls = upstream();
  const seen = new Map();
  const PER_VISITOR = { limit: async ({ key }) => { seen.set(key, (seen.get(key) || 0) + 1); return { success: seen.get(key) <= 2 }; } };
  assert.equal((await worker.fetch(post(body()), env({ PER_VISITOR }))).status, 200);
  assert.equal((await worker.fetch(post(body()), env({ PER_VISITOR }))).status, 200);
  const third = await worker.fetch(post(body()), env({ PER_VISITOR }));
  assert.equal(third.status, 429);
  assert.equal(calls.length, 2);
  assert.equal(seen.get("1.2.3.4"), 3);
});

test("Featherless's concurrency answer passes through, so Forge waits for a slot", async () => {
  upstream(() => new Response("concurrency limit reached", { status: 429 }));
  const res = await worker.fetch(post(body()), env());
  assert.equal(res.status, 429);
  assert.match(await res.text(), /concurrency/);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
});

test("a failing site key is the site's failure, and its details stay private", async () => {
  upstream(() => new Response("invalid key sk-123", { status: 401 }));
  const res = await worker.fetch(post(body()), env());
  assert.equal(res.status, 502);
  assert.doesNotMatch(await res.text(), /sk-123|invalid key/);
  upstream(() => new Response("upstream exploded: secret detail", { status: 500 }));
  const res2 = await worker.fetch(post(body()), env());
  assert.equal(res2.status, 502);
  assert.doesNotMatch(await res2.text(), /secret detail/);
});

test("with no key configured, the relay refuses without calling Featherless", async () => {
  const calls = upstream();
  assert.equal((await worker.fetch(post(body()), env({ FEATHERLESS_KEY: "" }))).status, 503);
  assert.equal(calls.length, 0);
});
