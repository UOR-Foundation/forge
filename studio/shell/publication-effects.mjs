// Checked browser effects for FoundrySpecification.publicationEffectsBoundary.
export const effectError = (code, message) => Object.assign(new Error(message), { code });
export function checkCancellation(signal) {
  if (signal?.aborted) throw effectError("cancelled", "Publication browser work was cancelled; submitted remote work may continue");
}

export async function requestBody(url, options = {}, { fetch = globalThis.fetch, signal, timeoutMs = 30000, read = (response) => response.text() } = {}) {
  checkCancellation(signal);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw effectError("invalidDeadline", "The request deadline must be a positive bounded duration");
  }
  const controller = new AbortController();
  let timer, abort, interruption;
  const interrupted = new Promise((_, reject) => {
    abort = () => { interruption = effectError("cancelled", "Publication browser work was cancelled; submitted remote work may continue"); controller.abort(); reject(interruption); };
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { interruption = effectError("timedOut", "The publication request exceeded its deadline"); controller.abort(); reject(interruption); }, timeoutMs);
  });
  try {
    const operation = async () => {
      checkCancellation(signal);
      const response = await fetch(url, { ...options, signal: controller.signal });
      checkCancellation(signal);
      if (interruption) throw interruption;
      const body = await read(response);
      checkCancellation(signal);
      return { response, body };
    };
    return await Promise.race([operation(), interrupted]);
  } catch (error) {
    if (interruption) throw interruption;
    if (signal?.aborted) checkCancellation(signal);
    if (error?.code === "timedOut" || error?.code === "cancelled") throw error;
    throw effectError("networkFailed", "The publication request or response body could not be read");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function publicationDelay(ms, { signal, sleep } = {}) {
  checkCancellation(signal);
  let timer, abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(effectError("cancelled", "Publication browser work was cancelled; submitted remote work may continue"));
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    const delay = sleep ? sleep(ms) : new Promise(resolve => { timer = setTimeout(resolve, ms); });
    await Promise.race([delay, interrupted]);
    checkCancellation(signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
