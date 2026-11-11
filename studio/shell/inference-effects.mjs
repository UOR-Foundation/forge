// Typed cloud transport for FoundrySpecification.inferenceEffectsBoundary.
const messages = {
  invalidInferenceRequest: "The cloud request is invalid or exceeds the size limit",
  inferenceCancelled: "Cloud response stopped; submitted inference may continue and incur charges",
  inferenceTimedOut: "The cloud response timed out; submitted inference may continue and incur charges",
  inferenceNetworkFailed: "The cloud connection failed",
  inferenceUnauthorized: "The provider requires a valid API key",
  inferencePaymentRequired: "The provider requires available credit",
  inferenceRateLimited: "The provider is busy; try again later",
  inferenceProviderFailed: "The provider could not complete this response",
  malformedInferenceResponse: "The provider returned an incomplete or invalid response",
  inferenceResponseTooLarge: "The cloud response exceeded the size limit",
  inferenceConsumerFailed: "The response could not be displayed or saved",
};
const fault = code => Object.assign(new Error(messages[code]), { code });
const codes = new Set(["invalidInferenceRequest", "inferenceCancelled", "inferenceTimedOut", "inferenceNetworkFailed", "inferenceUnauthorized", "inferencePaymentRequired", "inferenceRateLimited", "inferenceProviderFailed", "malformedInferenceResponse", "inferenceResponseTooLarge", "inferenceConsumerFailed"]);
const endpoints = { openrouter: "https://openrouter.ai/api/v1/chat/completions", featherless: "https://api.featherless.ai/v1/chat/completions" };
export async function cloudCompletion({ provider, key, bytes, origin, signal, onDelta, onReasoning }, { fetch = globalThis.fetch, timeoutMs = 600000, retryMs = 5000 } = {}) {
  if (!Object.hasOwn(endpoints, provider) || typeof bytes !== "string" || new TextEncoder().encode(bytes).length > 2 * 1024 * 1024 || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600000 || !Number.isSafeInteger(retryMs) || retryMs < 0 || retryMs > 5000) throw fault("invalidInferenceRequest");
  if (typeof key !== "string" || !key.trim()) throw fault("inferenceUnauthorized");
  if (signal?.aborted) throw fault("inferenceCancelled");
  const controller = new AbortController();
  let active = true, timer, abort, interrupted, reader, pauseTimer;
  const interruption = new Promise((_, reject) => {
    const stop = code => { interrupted = fault(code); active = false; controller.abort(); reject(interrupted); };
    abort = () => stop("inferenceCancelled");
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => stop("inferenceTimedOut"), timeoutMs);
  });
  const check = () => { if (!active || signal?.aborted) throw interrupted ?? fault("inferenceCancelled"); };
  const notify = async (callback, value) => { check(); if (callback) { try { await callback(value); } catch { throw fault("inferenceConsumerFailed"); } } check(); };
  const readBytes = async (response, maximum, consume) => {
    if (!response.body || typeof response.body.getReader !== "function") throw fault("malformedInferenceResponse");
    reader = response.body.getReader(); let total = 0;
    for (;;) {
      check(); let item; try { item = await reader.read(); } catch { throw fault("inferenceNetworkFailed"); } check();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) throw fault("malformedInferenceResponse");
      total += item.value.byteLength;
      if (total > maximum) throw fault("inferenceResponseTooLarge");
      await consume(item.value);
    }
    reader.releaseLock(); reader = null;
  };
  const operation = async () => {
    const headers = { Authorization: "Bearer " + key, "content-type": "application/json" };
    if (provider === "openrouter") { headers["HTTP-Referer"] = origin; headers["X-Title"] = "hologram-forge"; }
    let response;
    for (let attempt = 0; ; attempt++) {
      check(); response = await fetch(endpoints[provider], { method: "POST", headers, body: bytes, signal: controller.signal }); check();
      if (response.ok) break;
      if (response.status === 401 || response.status === 403) throw fault("inferenceUnauthorized");
      if (response.status === 402) throw fault("inferencePaymentRequired");
      if (response.status !== 429) throw fault("inferenceProviderFailed");
      if (provider !== "featherless" || attempt >= 60) throw fault("inferenceRateLimited");
      const decoder = new TextDecoder("utf-8", { fatal: true }); let errorText = "";
      try { await readBytes(response, 65536, bytes => { errorText += decoder.decode(bytes, { stream: true }); }); errorText += decoder.decode(); }
      catch (error) { if (codes.has(error?.code)) throw error; throw fault("malformedInferenceResponse"); }
      if (!/concurren/i.test(errorText)) throw fault("inferenceRateLimited");
      await notify(onReasoning, `Waiting for a free slot on the shared Featherless plan, ${attempt * retryMs / 1000} s…`);
      await new Promise(resolve => { pauseTimer = setTimeout(resolve, retryMs); }); check();
    }
    if (!/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw fault("malformedInferenceResponse");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let pending = "", data = [], frameLength = 0, text = "", thought = "", finish = null, last = null, first = null, done = false;
    const started = performance.now();
    const frame = async () => {
      if (!data.length) return;
      const payload = data.join("\n"); data = []; frameLength = 0;
      if (payload === "[DONE]") { if (done) throw fault("malformedInferenceResponse"); done = true; return; }
      if (done) throw fault("malformedInferenceResponse");
      let chunk; try { chunk = JSON.parse(payload); } catch { throw fault("malformedInferenceResponse"); }
      if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) throw fault("malformedInferenceResponse");
      if (chunk.error) throw fault("inferenceProviderFailed");
      if (!Array.isArray(chunk.choices) || chunk.choices.length > 1) throw fault("malformedInferenceResponse");
      for (const field of ["id", "model", "provider", "system_fingerprint"]) if (chunk[field] != null && typeof chunk[field] !== "string") throw fault("malformedInferenceResponse");
      if (chunk.usage != null) {
        if (typeof chunk.usage !== "object" || Array.isArray(chunk.usage)) throw fault("malformedInferenceResponse");
        for (const field of ["prompt_tokens", "completion_tokens"]) if (chunk.usage[field] != null && (!Number.isSafeInteger(chunk.usage[field]) || chunk.usage[field] < 0)) throw fault("malformedInferenceResponse");
        if (chunk.usage.cost != null && (typeof chunk.usage.cost !== "number" || !Number.isFinite(chunk.usage.cost) || chunk.usage.cost < 0)) throw fault("malformedInferenceResponse");
      }
      const choice = chunk.choices[0];
      if (chunk.choices.length) {
        if (!choice || typeof choice !== "object" || Array.isArray(choice) || choice.index !== 0 || !choice.delta || typeof choice.delta !== "object" || Array.isArray(choice.delta)) throw fault("malformedInferenceResponse");
        const delta = choice.delta;
        if (finish !== null) throw fault("malformedInferenceResponse");
        for (const field of ["content", "reasoning", "reasoning_content"]) if (delta[field] != null && typeof delta[field] !== "string") throw fault("malformedInferenceResponse");
        if (choice.finish_reason != null) {
          if (!["stop", "length"].includes(choice.finish_reason) || finish !== null) throw fault("malformedInferenceResponse");
          finish = choice.finish_reason;
        }
        const reasoning = delta.reasoning || delta.reasoning_content;
        if (reasoning && !text) { thought += reasoning; await notify(onReasoning, thought); }
        if (delta.content) { if (first === null) first = performance.now() - started; text += delta.content; await notify(onDelta, text); }
      }
      last = chunk;
    };
    const line = async raw => {
      if (raw.length > 65536) throw fault("inferenceResponseTooLarge");
      const value = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (!value) { await frame(); return; }
      if (value.startsWith("data:")) { const part = value.slice(5).replace(/^ /, ""); frameLength += part.length; if (frameLength > 65536) throw fault("inferenceResponseTooLarge"); data.push(part); }
    };
    try {
      await readBytes(response, 8 * 1024 * 1024, async bytes => {
        pending += decoder.decode(bytes, { stream: true });
        let at; while ((at = pending.indexOf("\n")) >= 0) { await line(pending.slice(0, at)); pending = pending.slice(at + 1); }
        if (pending.length > 65536) throw fault("inferenceResponseTooLarge");
      });
      pending += decoder.decode();
    } catch (error) { if (codes.has(error?.code)) throw error; throw fault("malformedInferenceResponse"); }
    if (pending || data.length || !done || !finish || !text.trim()) throw fault("malformedInferenceResponse");
    return { text: text.trim(), finish, last, ttftMs: Math.round(first || 0) };
  };
  try { return await Promise.race([operation(), interruption]); }
  catch (error) { if (interrupted) throw interrupted; if (codes.has(error?.code)) throw error; throw fault("inferenceNetworkFailed"); }
  finally {
    active = false; clearTimeout(timer); clearTimeout(pauseTimer); signal?.removeEventListener("abort", abort); controller.abort();
    if (reader) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} }
  }
}
