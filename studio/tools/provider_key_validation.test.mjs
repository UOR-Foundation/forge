import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { validateProviderKey, ProviderKeyError } from "../shell/provider-key-validation.mjs";
import { invokeHost, unwrapHost } from "../shell/host-boundary.mjs";
const input = { provider: "openrouter", apiKey: "synthetic-private-key" };
const valid = () => Response.json({ data: { label: "test-key", is_free_tier: false } });
const refuses = (operation, code) => assert.rejects(operation, error => error instanceof ProviderKeyError && error.code === code && !error.message.includes("synthetic-private"));
test("unsupported providers and invalid credentials perform no requests", async () => {
  const fetch = () => assert.fail("unexpected request");
  for (const provider of ["google", "auto", "featherless", "", "unknown"]) await refuses(validateProviderKey({ ...input, provider }, { fetch }), "unsupportedProvider");
  for (const apiKey of ["", "x y", "x\ny", "é", "x".repeat(8193), null]) await refuses(validateProviderKey({ ...input, apiKey }, { fetch }), "invalidCredential");
});
test("authentication uses only the fixed credential endpoint and admitted metadata", async () => {
  assert.deepEqual(await validateProviderKey(input, { fetch: async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/auth/key"); assert.equal(options.method, "GET");
    assert.equal(options.headers.authorization, "Bearer synthetic-private-key"); assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit"); assert.equal(options.cache, "no-store");
    return valid();
  } }), { ok: true });
});
test("status failures never read private provider bodies", async () => {
  for (const [status, code] of [[401, "credentialRejected"], [403, "credentialRejected"], [429, "keyValidationRateLimited"], [500, "keyValidationProviderFailed"], [302, "keyValidationProviderFailed"]]) {
    let cancelled = false;
    await refuses(validateProviderKey(input, { fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status }) }), code);
    assert.equal(cancelled, true);
  }
  await refuses(validateProviderKey(input, { fetch: async () => { throw Error("synthetic-private-provider-details"); } }), "keyValidationNetworkFailed");
});
test("malformed content, JSON, UTF8 and authentication metadata fail", async () => {
  for (const response of [new Response("html"), new Response("bad", { headers: { "content-type": "application/json" } }), new Response(new Uint8Array([255]), { headers: { "content-type": "application/json" } }), Response.json({}), Response.json({ data: [] }), Response.json({ data: { label: "", is_free_tier: false } }), Response.json({ data: { label: "key", is_free_tier: "false" } })]) await refuses(validateProviderKey(input, { fetch: async () => response }), "keyValidationMalformed");
  await refuses(validateProviderKey(input, { timeoutMs: 0 }), "keyValidationMalformed");
});
test("response expansion and deadlines remain bounded through body consumption", async () => {
  await refuses(validateProviderKey(input, { fetch: async () => new Response("x".repeat(65537), { headers: { "content-type": "application/json" } }) }), "keyValidationTooLarge");
  await refuses(validateProviderKey(input, { timeoutMs: 5, fetch: () => new Promise(() => {}) }), "keyValidationTimedOut");
  let cancelled = false;
  await refuses(validateProviderKey(input, { timeoutMs: 5, fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } }) }), "keyValidationTimedOut");
  assert.equal(cancelled, true);
});
test("cancellation before requests and after headers prevents success", async () => {
  const first = new AbortController(); first.abort();
  await refuses(validateProviderKey(input, { signal: first.signal, fetch: () => assert.fail("unexpected request") }), "keyValidationCancelled");
  const second = new AbortController(); let cancelled = false;
  await refuses(validateProviderKey(input, { signal: second.signal, fetch: async () => { second.abort(); return new Response(new ReadableStream({ cancel() { cancelled = true; } })); } }), "keyValidationCancelled");
  assert.equal(cancelled, true);
});
test("host failures retain only the modeled code and fixed public message", async () => {
  for (const code of ["unsupportedProvider", "invalidCredential", "credentialRejected", "keyValidationRateLimited", "keyValidationProviderFailed", "keyValidationMalformed", "keyValidationTooLarge", "keyValidationNetworkFailed", "keyValidationTimedOut", "keyValidationCancelled"]) {
    const error = new ProviderKeyError(code); error.message = "synthetic-private-message";
    const envelope = await invokeHost("validate-provider-api-key", [input], () => { throw error; });
    assert.equal(envelope.ok, false); assert.equal(envelope.error.code, code); assert.ok(!JSON.stringify(envelope).includes("synthetic-private"));
    assert.throws(() => unwrapHost(envelope), value => value.code === code);
  }
});
test("the actual host delegates credential validation to the modeled boundary", async () => {
  const source = fs.readFileSync(new URL("../shell/host.js", import.meta.url), "utf8");
  const line = source.split("\n").find(value => value.startsWith('handlers.set("validate-provider-api-key",'));
  assert.ok(line); const handlers = new Map(); let observed;
  vm.runInNewContext(line, { handlers, validateProviderKey: async value => { observed = value; return { ok: true }; } });
  await handlers.get("validate-provider-api-key")(input); assert.equal(observed, input);
  const model = fs.readFileSync(new URL("../../app/src/FoundrySpecification.lex.tex", import.meta.url), "utf8");
  assert.ok(model.includes("name: providerKeyBoundary,"));
  for (const code of ["unsupportedProvider", "invalidCredential", "credentialRejected", "keyValidationRateLimited", "keyValidationProviderFailed", "keyValidationMalformed", "keyValidationTooLarge", "keyValidationNetworkFailed", "keyValidationTimedOut", "keyValidationCancelled"]) assert.ok(model.includes(`name: ${code}, fields: []`));
});
