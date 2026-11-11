// Typed credential-check adapter for FoundrySpecification.providerKeyBoundary.
const failures = Object.freeze({
  unsupportedProvider: ["not_found", "Credential validation is unavailable for this provider"],
  invalidCredential: ["validation", "Enter a nonempty credential without spaces or control characters"],
  credentialRejected: ["external", "The provider rejected this credential"],
  keyValidationRateLimited: ["external", "The provider rate-limited credential validation"],
  keyValidationProviderFailed: ["external", "The provider could not validate the credential"],
  keyValidationMalformed: ["external", "The provider returned an invalid credential response"],
  keyValidationTooLarge: ["external", "The credential response exceeded its byte limit"],
  keyValidationNetworkFailed: ["external", "The credential request could not complete"],
  keyValidationTimedOut: ["external", "Credential validation exceeded its deadline"],
  keyValidationCancelled: ["external", "Credential validation was cancelled"],
});
export class ProviderKeyError extends Error {
  constructor(code) { super(failures[code][1]); this.name = "ProviderKeyError"; this.code = code; }
}
export function providerKeyFailure(error) {
  if (!(error instanceof ProviderKeyError)) return null;
  try {
    const code = error.code;
    if (!Object.hasOwn(failures, code)) return null;
    return { code, kind: failures[code][0], message: failures[code][1] };
  } catch { return null; }
}
const fail = code => { throw new ProviderKeyError(code); };
export async function validateProviderKey(input, { fetch = globalThis.fetch, signal, timeoutMs = 20000 } = {}) {
  if (!input || input.provider !== "openrouter") fail("unsupportedProvider");
  const key = input.apiKey;
  if (typeof key !== "string" || key.length === 0 || key.length > 8192 || !/^[\x21-\x7e]+$/.test(key)) fail("invalidCredential");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) fail("keyValidationMalformed");
  const controller = new AbortController(); let timer, reader, rejectStop, interruption;
  const interrupted = new Promise((_, reject) => { rejectStop = reject; });
  const stop = code => { if (!interruption) { interruption = new ProviderKeyError(code); controller.abort(); rejectStop(interruption); } };
  const abort = () => stop("keyValidationCancelled");
  const operation = async () => {
    if (interruption) throw interruption;
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", { method: "GET", headers: { authorization: "Bearer " + key, accept: "application/json" }, redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal });
    if (interruption) { response.body?.cancel().catch(() => {}); throw interruption; }
    if (response.status !== 200) {
      response.body?.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403) fail("credentialRejected");
      if (response.status === 429) fail("keyValidationRateLimited");
      fail("keyValidationProviderFailed");
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) { response.body?.cancel().catch(() => {}); fail("keyValidationMalformed"); }
    if (!response.body) fail("keyValidationMalformed");
    reader = response.body.getReader(); const chunks = []; let length = 0;
    while (true) {
      const next = await reader.read();
      if (interruption) throw interruption;
      if (next.done) break;
      length += next.value.length;
      if (length > 65536) fail("keyValidationTooLarge");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let result;
    try { result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { fail("keyValidationMalformed"); }
    const data = result?.data;
    if (!data || Array.isArray(data) || typeof data !== "object" || typeof data.label !== "string" || data.label.length === 0 || typeof data.is_free_tier !== "boolean") fail("keyValidationMalformed");
    return { ok: true };
  };
  try {
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => stop("keyValidationTimedOut"), timeoutMs);
    if (signal?.aborted) abort();
    return await Promise.race([interrupted, operation()]);
  } catch (error) {
    if (interruption) throw interruption;
    if (error instanceof ProviderKeyError) throw error;
    fail("keyValidationNetworkFailed");
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort); controller.abort();
    if (reader) reader.cancel().catch(() => {});
  }
}
