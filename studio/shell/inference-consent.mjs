// FoundrySpecification.inferenceConsentBoundary. One decision per exact request.
import { inferenceEndpoints } from "./inference-effects.mjs";
const messages = {
  invalidInferenceConsent: "The cloud request disclosure is invalid",
  inferenceConsentDenied: "Cloud request declined; no request was submitted",
  inferenceConsentCancelled: "Cloud request cancelled before submission",
  inferenceConsentTimedOut: "Cloud request approval expired; no request was submitted",
  inferenceOffline: "Cloud inference is unavailable while offline",
  inferenceConsentUnavailable: "The cloud request approval could not be displayed",
};
const fault = code => Object.assign(new Error(messages[code]), { code });
export function describeInference(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fault("invalidInferenceConsent");
  const { provider, model, bytes, credentialOwner } = input;
  if (!Object.hasOwn(inferenceEndpoints, provider) || typeof model !== "string" || !model || model.length > 256 || typeof bytes !== "string" || !["visitor", "site"].includes(credentialOwner)) throw fault("invalidInferenceConsent");
  const size = new TextEncoder().encode(bytes).length;
  if (!size || size > 2 * 1024 * 1024) throw fault("invalidInferenceConsent");
  try { const body = JSON.parse(bytes); if (!body || typeof body !== "object" || Array.isArray(body)) throw Error(); }
  catch { throw fault("invalidInferenceConsent"); }
  return Object.freeze({ provider, endpoint: inferenceEndpoints[provider], model, bytes, size, credentialOwner });
}
export function authorizeInference(input, { document = globalThis.document, online = () => globalThis.navigator.onLine, timeoutMs = 300000 } = {}) {
  let disclosure, signal;
  try {
    disclosure = describeInference(input);
    signal = input.signal;
    if (signal != null && !(signal instanceof AbortSignal)) throw fault("invalidInferenceConsent");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw fault("invalidInferenceConsent");
    if (signal?.aborted) throw fault("inferenceConsentCancelled");
    if (!online()) throw fault("inferenceOffline");
  } catch (error) { return Promise.reject(messages[error?.code] ? error : fault("inferenceConsentUnavailable")); }
  return new Promise((resolve, reject) => {
    let dialog, active, timer, approved = false, settled = false;
    const controller = new AbortController();
    const previous = document?.activeElement;
    const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
    const close = () => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      dialog?.remove(); active?.remove();
    };
    const refuse = code => {
      if (settled) return;
      settled = true; close(); previous?.focus?.(); reject(fault(code));
    };
    const abort = () => {
      controller.abort();
      if (!approved) refuse("inferenceConsentCancelled");
      else close();
    };
    try {
      dialog = element("dialog"); dialog.setAttribute("aria-label", "Review cloud request");
      dialog.style.cssText = "max-width:min(90vw,42rem);max-height:85vh;overflow:auto;padding:1.5rem;border-radius:0.75rem;color-scheme:light dark;font:inherit";
      dialog.append(element("h2", "Send this request to an AI provider?"));
      dialog.append(element("p", `${disclosure.provider} · ${disclosure.model}`));
      dialog.append(element("p", `Destination: ${disclosure.endpoint}`));
      dialog.append(element("p", disclosure.credentialOwner === "visitor" ? "Credential: your configured API key. Provider charges apply to its account." : "Credential: this site's shared API key. Provider charges apply to the site's account."));
      dialog.append(element("p", "This sends the request below, including its messages and any project files or conversation history they contain. The provider may retain submitted data under its policies. Approval covers only this request, including bounded retries of these same bytes."));
      dialog.append(element("p", "Stopping ends this browser's request. It cannot recall submitted data or guarantee that remote work or charges stop."));
      const details = element("details"), summary = element("summary", `Review exact request (${disclosure.size} UTF-8 bytes)`), pre = element("pre", disclosure.bytes);
      pre.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:18rem;overflow:auto";
      details.append(summary, pre); dialog.append(details);
      const actions = element("div"), deny = element("button", "Don't send"), allow = element("button", "Send this request");
      actions.style.cssText = "display:flex;gap:1rem;justify-content:flex-end;margin-top:1rem";
      deny.type = allow.type = "button"; deny.autofocus = true;
      deny.addEventListener("click", () => refuse("inferenceConsentDenied"));
      dialog.addEventListener("cancel", event => { event.preventDefault(); refuse("inferenceConsentDenied"); });
      allow.addEventListener("click", () => {
        if (settled) return;
        if (signal?.aborted) { refuse("inferenceConsentCancelled"); return; }
        if (!online()) { refuse("inferenceOffline"); return; }
        try {
          active = element("aside"); active.setAttribute("aria-label", "Active cloud request");
          active.style.cssText = "position:fixed;bottom:1rem;right:1rem;z-index:2147483647;padding:0.75rem;border:1px solid;border-radius:0.5rem;background:Canvas;color:CanvasText;color-scheme:light dark;font:inherit";
          const stop = element("button", `Stop cloud request (${disclosure.provider})`); stop.type = "button";
          stop.addEventListener("click", () => { controller.abort(); close(); });
          active.append(stop); document.body.append(active);
          clearTimeout(timer); dialog.remove(); previous?.focus?.();
          approved = true; settled = true;
          resolve(Object.freeze({ signal: controller.signal, close, disclosure }));
        } catch { refuse("inferenceConsentUnavailable"); }
      });
      actions.append(deny, allow); dialog.append(actions); document.body.append(dialog);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      timer = setTimeout(() => refuse("inferenceConsentTimedOut"), timeoutMs);
      dialog.showModal(); deny.focus();
    } catch { refuse("inferenceConsentUnavailable"); }
  });
}
