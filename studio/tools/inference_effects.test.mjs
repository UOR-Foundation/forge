import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { cloudCompletion } from "../shell/inference-effects.mjs";
const request = { provider: "openrouter", key: "private-key", bytes: '{}', origin: "https://foundry.test" };
const code = expected => error => error.code === expected && !error.message.includes("private");
const chunk = (delta = {}, finish_reason = null) => ({ id: "completion", model: "provider/model", choices: [{ index: 0, delta, finish_reason }] });
const event = value => `data: ${JSON.stringify(value)}\n\n`;
const valid = event(chunk({ reasoning: "thinking" })) + event(chunk({ content: "hello 🌱" })) + event(chunk({}, "stop")) + event({ id: "completion", choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, cost: 0.001 } }) + "data: [DONE]\n\n";
const response = text => new Response(text, { headers: { "content-type": "text/event-stream; charset=utf-8" } });
const execute = (text, extra = {}) => cloudCompletion(request, { fetch: async () => response(text), ...extra });
test("streaming handles split UTF8, CRLF, reasoning and usage without exposing credentials", async () => {
  const bytes = new TextEncoder().encode(valid.replaceAll("\n", "\r\n")), deltas = [], reasons = [];
  let sent;
  const result = await cloudCompletion({ ...request, onDelta: x => deltas.push(x), onReasoning: x => reasons.push(x) }, { fetch: async (url, options) => {
    sent = { url, options };
    return new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } }), { headers: { "content-type": "text/event-stream" } });
  } });
  assert.equal(result.text, "hello 🌱"); assert.equal(result.finish, "stop");
  assert.equal(result.last.usage.completion_tokens, 2); assert.deepEqual(deltas, ["hello 🌱"]); assert.deepEqual(reasons, ["thinking"]);
  assert.equal(sent.url, "https://openrouter.ai/api/v1/chat/completions"); assert.equal(sent.options.headers.Authorization, "Bearer private-key");
});
test("missing credentials, unknown providers and invalid request bounds never fetch", async () => {
  let calls = 0; const fetch = async () => { calls++; throw Error(); };
  for (const [change, expected] of [[{ key: "" }, "inferenceUnauthorized"], [{ provider: "unknown" }, "invalidInferenceRequest"], [{ bytes: "x".repeat(2 * 1024 * 1024 + 1) }, "invalidInferenceRequest"]]) await assert.rejects(cloudCompletion({ ...request, ...change }, { fetch }), code(expected));
  await assert.rejects(cloudCompletion(request, { fetch, timeoutMs: 0 }), code("invalidInferenceRequest"));
  assert.equal(calls, 0);
});
test("HTTP failures and transport failures return typed private-data-free errors", async () => {
  for (const [status, expected] of [[401, "inferenceUnauthorized"], [403, "inferenceUnauthorized"], [402, "inferencePaymentRequired"], [429, "inferenceRateLimited"], [500, "inferenceProviderFailed"]]) {
    await assert.rejects(cloudCompletion(request, { fetch: async () => new Response("private-provider-detail", { status }) }), code(expected));
  }
  await assert.rejects(cloudCompletion(request, { fetch: async () => { throw Error("private-key"); } }), code("inferenceNetworkFailed"));
});
test("one deadline covers headers, body reads and retries even when a provider ignores abort", async () => {
  await assert.rejects(cloudCompletion(request, { fetch: () => new Promise(() => {}), timeoutMs: 10 }), code("inferenceTimedOut"));
  let cancelled = false;
  await assert.rejects(cloudCompletion(request, { timeoutMs: 10, fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "text/event-stream" } }) }), code("inferenceTimedOut"));
  assert.equal(cancelled, true);
  await assert.rejects(cloudCompletion({ ...request, provider: "featherless" }, { timeoutMs: 10, fetch: async () => new Response("concurrency", { status: 429 }) }), code("inferenceTimedOut"));
});
test("cancellation aborts work and late provider data cannot invoke callbacks", async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(cloudCompletion({ ...request, signal: controller.signal }, { fetch: async () => { calls++; } }), code("inferenceCancelled")); assert.equal(calls, 0);
  const running = new AbortController(); let resolve, deltas = 0;
  const pending = cloudCompletion({ ...request, signal: running.signal, onDelta: () => deltas++ }, { fetch: () => new Promise(r => { resolve = r; }) });
  running.abort(); await assert.rejects(pending, code("inferenceCancelled")); resolve(response(valid));
  await new Promise(r => setTimeout(r, 0)); assert.equal(deltas, 0);
});
test("malformed, incomplete, oversized and failed streams cannot become successful answers", async () => {
  const bad = ["data: broken\n\n", "data: broken\n\n" + valid, valid.replace("data: [DONE]\n\n", ""), valid.replace('"content":"hello 🌱"', '"content":17'), valid.replace('"finish_reason":"stop"', '"finish_reason":"content_filter"'), valid + event(chunk({ content: "late" })), valid.replace('"completion_tokens":2', '"completion_tokens":-1')];
  for (const text of bad) await assert.rejects(execute(text), code("malformedInferenceResponse"));
  await assert.rejects(execute("data: " + "x".repeat(65537)), code("inferenceResponseTooLarge"));
  await assert.rejects(execute(": heartbeat\n\n".repeat(700000)), code("inferenceResponseTooLarge"));
  await assert.rejects(execute(event({ choices: [null] }) + valid), code("malformedInferenceResponse"));
  await assert.rejects(cloudCompletion(request, { fetch: async () => new Response(new ReadableStream({ start(c) { c.error(Error("private")); } }), { headers: { "content-type": "text/event-stream" } }) }), code("inferenceNetworkFailed"));
  await assert.rejects(execute(event({ error: { message: "private" } })), code("inferenceProviderFailed"));
  await assert.rejects(cloudCompletion(request, { fetch: async () => new Response(valid) }), code("malformedInferenceResponse"));
  await assert.rejects(cloudCompletion(request, { fetch: async () => new Response(Uint8Array.of(255), { headers: { "content-type": "text/event-stream" } }) }), code("malformedInferenceResponse"));
  for (const onDelta of [() => { throw Error("private"); }, async () => { throw Error("private"); }]) await assert.rejects(cloudCompletion({ ...request, onDelta }, { fetch: async () => response(valid) }), code("inferenceConsumerFailed"));
});
test("bounded Featherless concurrency retries preserve the same request and can succeed", async () => {
  const calls = []; let messages = 0;
  const result = await cloudCompletion({ ...request, provider: "featherless", onReasoning: () => messages++ }, { retryMs: 0, fetch: async (url, options) => { calls.push({ url, options }); return calls.length === 1 ? new Response("concurrency limit", { status: 429 }) : response(valid); } });
  assert.equal(result.text, "hello 🌱"); assert.equal(calls.length, 2); assert.equal(messages, 2);
  assert.equal(calls[0].url, "https://api.featherless.ai/v1/chat/completions"); assert.equal(calls[0].options.body, calls[1].options.body);
  assert.equal(calls[0].options.headers["HTTP-Referer"], undefined);
});
test("the actual paidGenerate adapter delegates transport and records validated output", async () => {
  const source = fs.readFileSync(new URL("../shell/inference.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function paidGenerate"), end = source.indexOf("// ---- the route:", start);
  let captured;
  const context = { providerOf: () => "openrouter", paidId: m => m.replace("openrouter/", ""), coreReady: async () => ({ run: () => ({ bytes: '{}' }) }), keyFor: async () => "key", viewReady: async () => ({}), location: { origin: "https://foundry.test" }, cloudCompletion: async input => { captured = input; return { text: "answer", finish: "stop", ttftMs: 12, last: { id: "r", usage: { prompt_tokens: 4, completion_tokens: 1 } } }; } };
  vm.createContext(context); vm.runInContext(source.slice(start, end).replace("export ", ""), context);
  const result = await context.paidGenerate({ model: "openrouter/model" });
  assert.equal(captured.bytes, '{}'); assert.equal(result.text, "answer"); assert.equal(result.rec.ttftMs, 12); assert.equal(result.rec.rederivable, false);
});
