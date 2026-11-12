import { oneAtATime } from "./approval-queue.mjs";
// FoundrySpecification.hostedSourcePermissionBoundary. Permission is never persisted or inferred.
export const HOSTED_SOURCE_ENDPOINT = 'https://mcp.uor.foundation/';
const messages = {
  invalidHostedSourcePermission: 'Invalid hosted source permission',
  hostedSourcePermissionDenied: 'Hosted source transfer declined; no new source was sent',
  hostedSourcePermissionCancelled: 'Hosted source transfer stopped; submitted data cannot be recalled',
  hostedSourcePermissionExpired: 'Hosted source permission expired',
  hostedSourcePermissionOffline: 'Hosted source transfer is unavailable offline',
  hostedSourcePermissionUnavailable: 'Hosted source permission could not be displayed',
  hostedSourceChanged: 'The application source or turn changed; approve the current work again',
  hostedSourceNetworkFailed: 'The hosted source request failed',
  hostedSourceMalformedResponse: 'The hosted source service returned an invalid response',
  hostedSourceServiceRefused: 'The hosted source service refused the request',
};
export const hostedSourceFailure = code => Object.assign(new Error(messages[code] || messages.invalidHostedSourcePermission), { code: Object.hasOwn(messages, code) ? code : 'invalidHostedSourcePermission' });
const fail = code => { throw hostedSourceFailure(code); };
const onlineDefault = () => globalThis.navigator?.onLine !== false;
const utf8 = s => new TextEncoder().encode(s).length;
function filesOf(files) {
  if (!Array.isArray(files) || !files.length || files.length > 32) fail('invalidHostedSourcePermission');
  let size = 0;
  const copied = files.map(file => {
    if (!file || Object.keys(file).sort().join() !== 'content,path' || typeof file.path !== 'string' || !/^src\/(?:[A-Za-z_]\w*\/)*[A-Za-z_]\w*\.lex\.tex$/.test(file.path) || typeof file.content !== 'string' || !file.content.length) fail('invalidHostedSourcePermission');
    size += utf8(file.content);
    return Object.freeze({ path: file.path, content: file.content });
  });
  if (size > 2 * 1024 * 1024 || new Set(copied.map(f => f.path)).size !== copied.length) fail('invalidHostedSourcePermission');
  return Object.freeze(copied);
}
const signalValid = signal => signal === undefined || (signal && typeof signal.aborted === 'boolean' && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function');
export function describeHostedSource(input) {
  if (!input || !['source', 'turn'].includes(input.scope) || !['parse', 'check'].includes(input.purpose)) fail('invalidHostedSourcePermission');
  const files = filesOf(input.files);
  const disclosure = { scope: input.scope, purpose: input.purpose, endpoint: HOSTED_SOURCE_ENDPOINT, files, size: files.reduce((n, f) => n + utf8(f.content), 0) };
  if (input.scope === 'turn') {
    if (!(Number.isSafeInteger(input.appId) && input.appId > 0) || !['turnId', 'source'].every(key => typeof input[key] === 'string' && input[key].length > 0 && input[key].length <= 256 && !/[\r\n]/.test(input[key]))) fail('invalidHostedSourcePermission');
    Object.assign(disclosure, { appId: input.appId, turnId: input.turnId, source: input.source });
  }
  return Object.freeze(disclosure);
}
// Asked in its turn: a dialog opened over another approval's would cover its buttons (approval-queue.mjs).
export function authorizeHostedSource(input, options) { return oneAtATime(() => authorizeHostedSourceNow(input, options)); }
function authorizeHostedSourceNow(input, { document = globalThis.document, online = onlineDefault, now = Date.now, timeoutMs = 300000 } = {}) {
  let disclosure;
  try {
    disclosure = describeHostedSource(input);
    if (!signalValid(input.signal) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) fail('invalidHostedSourcePermission');
    if (input.signal?.aborted) fail('hostedSourcePermissionCancelled');
    if (!online()) fail('hostedSourcePermissionOffline');
  } catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    const controller = new AbortController(), previous = document?.activeElement, expires = now() + timeoutMs;
    let dialog, active, timer, approved = false, settled = false;
    const close = () => { clearTimeout(timer); input.signal?.removeEventListener('abort', abort); dialog?.remove(); active?.remove(); previous?.focus?.(); };
    const stop = code => { controller.abort(); close(); if (!settled) { settled = true; reject(hostedSourceFailure(code)); } };
    const abort = () => stop('hostedSourcePermissionCancelled');
    try {
      const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
      dialog = el('dialog'); dialog.setAttribute('aria-label', 'Review hosted source transfer');
      dialog.style.cssText = 'max-width:min(90vw,44rem);max-height:85vh;overflow:auto;padding:24px;border-radius:12px;color-scheme:light dark';
      dialog.append(el('h2', 'Send app source for preview and checking?'), el('p', 'Destination: ' + disclosure.endpoint));
      dialog.append(el('p', 'This sends LexLean source and its supporting library to the UOR hosted service to parse preview data and check the module. Source may contain project or conversation details. The service may retain it. No provider API key or browser cookies are sent. This does not authorize proof or publication.'));
      dialog.append(el('p', disclosure.scope === 'turn' ? `Application ${disclosure.appId}, turn ${disclosure.turnId}, captured source ${disclosure.source}. Approval includes later generated module prefixes and repairs plus supporting library files from this same turn, for at most five minutes. It does not cover another application or turn.` : 'Approval covers only the exact files below for this operation, for at most five minutes.'));
      dialog.append(el('p', 'Stop aborts browser requests. It cannot recall submitted data or guarantee that remote work stops.'));
      const details = el('details'), pre = el('pre', disclosure.files.map(f => f.path + '\n' + f.content).join('\n\n'));
      pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:18rem;overflow:auto';
      details.append(el('summary', `Review current source (${disclosure.size} UTF-8 bytes)`), pre); dialog.append(details);
      const deny = el('button', "Don't send"), allow = el('button', disclosure.scope === 'turn' ? 'Allow this turn' : 'Send this source');
      deny.type = allow.type = 'button'; deny.autofocus = true;
      deny.addEventListener('click', () => stop('hostedSourcePermissionDenied'));
      dialog.addEventListener('cancel', event => { event.preventDefault(); stop('hostedSourcePermissionDenied'); });
      allow.addEventListener('click', () => {
        if (settled) return;
        if (input.signal?.aborted) return stop('hostedSourcePermissionCancelled');
        if (now() >= expires) return stop('hostedSourcePermissionExpired');
        if (!online()) return stop('hostedSourcePermissionOffline');
        try {
          active = el('aside'); active.setAttribute('aria-label', 'Active hosted source transfer');
          active.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:2147483647;padding:12px;background:Canvas;color:CanvasText;border:1px solid;border-radius:8px';
          const stopButton = el('button', 'Stop hosted source transfer'); stopButton.type = 'button'; stopButton.addEventListener('click', abort); active.append(stopButton); document.body.append(active);
          dialog.remove(); previous?.focus?.(); approved = true; settled = true;
          resolve(Object.freeze({ disclosure, expires, signal: controller.signal, close }));
        } catch { stop('hostedSourcePermissionUnavailable'); }
      });
      dialog.append(deny, allow); document.body.append(dialog);
      input.signal?.addEventListener('abort', abort, { once: true });
      if (input.signal?.aborted) return abort();
      timer = setTimeout(() => stop('hostedSourcePermissionExpired'), timeoutMs);
      dialog.showModal(); deny.focus();
    } catch { if (!approved) stop('hostedSourcePermissionUnavailable'); }
  });
}
const sessions = new WeakSet();
function sessionFor(context, { authorize = authorizeHostedSource, online = onlineDefault, now = Date.now, requestTimeoutMs = 30000 } = {}) {
  if (!signalValid(context.signal) || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 30000) fail('invalidHostedSourcePermission');
  const controller = new AbortController();
  let permission, approved, closed = false, expiryTimer;
  const abort = () => controller.abort();
  context.signal?.addEventListener('abort', abort, { once: true });
  if (context.signal?.aborted) abort();
  const close = () => { closed = true; abort(); clearTimeout(expiryTimer); approved?.close(); context.signal?.removeEventListener('abort', abort); approved?.signal?.removeEventListener('abort', abort); };
  const assertActive = async () => {
    if (approved && now() >= approved.expires) fail('hostedSourcePermissionExpired');
    if (closed || controller.signal.aborted) fail('hostedSourcePermissionCancelled');
    if (!online()) fail('hostedSourcePermissionOffline');
    if (context.assertCurrent) {
      try { if (await context.assertCurrent() === false) throw Error(); }
      catch { close(); fail('hostedSourceChanged'); }
    }
    if (closed || controller.signal.aborted) fail('hostedSourcePermissionCancelled');
  };
  const session = {
    close,
    async run(input, operation, fetchImpl = globalThis.fetch) {
      const disclosure = describeHostedSource({ ...context, ...input, scope: context.scope });
      if (!signalValid(input.signal) || typeof operation !== 'function' || typeof fetchImpl !== 'function') fail('invalidHostedSourcePermission');
      if (input.signal?.aborted) fail('hostedSourcePermissionCancelled');
      await assertActive();
      if (!permission) {
        permission = Promise.resolve().then(() => authorize({ ...disclosure, signal: controller.signal })).then(value => {
          if (!value || JSON.stringify(value.disclosure) !== JSON.stringify(disclosure) || !signalValid(value.signal) || !value.signal || typeof value.close !== 'function' || !Number.isFinite(value.expires) || value.expires > now() + 300000) { value?.close?.(); fail('invalidHostedSourcePermission'); }
          approved = value;
          if (closed || controller.signal.aborted) { value.close(); fail('hostedSourcePermissionCancelled'); }
          value.signal.addEventListener('abort', abort, { once: true });
          if (value.signal.aborted) abort();
          expiryTimer = setTimeout(() => { abort(); value.close(); }, Math.max(1, value.expires - now()));
          return value;
        });
      }
      await permission; await assertActive();
      const local = new AbortController(), cancel = () => local.abort();
      controller.signal.addEventListener('abort', cancel, { once: true }); input.signal?.addEventListener('abort', cancel, { once: true });
      if (controller.signal.aborted || input.signal?.aborted) cancel();
      let draft, wrote = false, checked = false;
      const readPaths = new Set();
      const request = async (url, init) => {
        await assertActive(); if (local.signal.aborted) fail('hostedSourcePermissionCancelled');
        let payload;
        try { payload = JSON.parse(init.body); } catch { fail('invalidHostedSourcePermission'); }
        const { name, arguments: args } = payload.params || {};
        if (url !== HOSTED_SOURCE_ENDPOINT || init.method !== 'POST' || payload.jsonrpc !== '2.0' || payload.method !== 'tools/call' || Object.keys(payload).sort().join() !== 'id,jsonrpc,method,params' || !Number.isSafeInteger(payload.id) || payload.id < 1 || Object.keys(payload.params || {}).sort().join() !== 'arguments,name' || !args) fail('invalidHostedSourcePermission');
        if (name === 'lexlean_draft_write') {
          if (wrote || args.profile !== 'prism-app' || Object.keys(args).sort().join() !== 'files,profile' || JSON.stringify(filesOf(args.files)) !== JSON.stringify(disclosure.files)) fail('invalidHostedSourcePermission');
          wrote = true;
        } else if (name === 'lexlean_check') {
          if (disclosure.purpose !== 'check' || checked || !draft || args.project !== draft || args.all !== true || Object.keys(args).sort().join() !== 'all,project') fail('invalidHostedSourcePermission');
          checked = true;
        } else if (name === 'lexlean_draft_read') {
          if (!draft || args.draft !== draft || args.view !== 'data' || !disclosure.files.some(f => f.path === args.path) || readPaths.has(args.path) || Object.keys(args).sort().join() !== 'draft,path,view') fail('invalidHostedSourcePermission');
          readPaths.add(args.path);
        } else fail('invalidHostedSourcePermission');
        const transport = new AbortController(); let timer, rejectStop, reason;
        const interrupted = new Promise((_, reject) => { rejectStop = reject; });
        const stop = code => { reason = hostedSourceFailure(code); transport.abort(); rejectStop(reason); };
        const cancelled = () => stop(approved && now() >= approved.expires ? 'hostedSourcePermissionExpired' : 'hostedSourcePermissionCancelled');
        local.signal.addEventListener('abort', cancelled, { once: true });
        if (local.signal.aborted) cancelled();
        timer = setTimeout(() => stop('hostedSourcePermissionExpired'), Math.min(requestTimeoutMs, Math.max(1, approved.expires - now())));
        try {
          const work = async () => {
            if (reason) throw reason;
            const res = await fetchImpl(HOSTED_SOURCE_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(payload), redirect: 'error', credentials: 'omit', signal: transport.signal });
            if (reason) throw reason;
            if (!res?.ok) fail('hostedSourceServiceRefused');
            let body;
            try { body = await res.json(); } catch { fail('hostedSourceMalformedResponse'); }
            if (reason) throw reason;
            if (!body || typeof body !== 'object' || !body.result || body.error || body.result.isError) fail('hostedSourceServiceRefused');
            let data;
            try { data = body.result.structuredContent ?? JSON.parse(body.result.content?.[0]?.text); } catch { fail('hostedSourceMalformedResponse'); }
            if (!data || typeof data !== 'object' || Array.isArray(data)) fail('hostedSourceMalformedResponse');
            if (name === 'lexlean_draft_write') {
              if (typeof data.draft !== 'string' || !data.draft || data.draft.length > 512) fail('hostedSourceMalformedResponse');
              draft = data.draft;
            } else if (name === 'lexlean_check') {
              if (typeof data.success !== 'boolean' || !Array.isArray(data.diagnostics) || data.diagnostics.length > 256 || data.diagnostics.some(d => !d || typeof d.message !== 'string')) fail('hostedSourceMalformedResponse');
            } else if (data.data?.spec !== 'lexlean/semantic-module/2' || !Array.isArray(data.data.declarations)) fail('hostedSourceMalformedResponse');
            await assertActive(); if (local.signal.aborted) fail('hostedSourcePermissionCancelled');
            return { ok: true, status: 200, json: async () => ({ result: { structuredContent: data } }) };
          };
          return await Promise.race([work(), interrupted]);
        } catch (error) { if (reason) throw reason; if (messages[error?.code]) throw error; fail('hostedSourceNetworkFailed'); }
        finally { clearTimeout(timer); local.signal.removeEventListener('abort', cancelled); }
      };
      try { const result = await operation(request); await assertActive(); if (local.signal.aborted) fail('hostedSourcePermissionCancelled'); return result; }
      finally { controller.signal.removeEventListener('abort', cancel); input.signal?.removeEventListener('abort', cancel); local.abort(); }
    },
  };
  sessions.add(session); return Object.freeze(session);
}
export function createHostedSourceSession(context, boundary) {
  describeHostedSource({ ...context, scope: 'turn', purpose: 'parse', files: [{ path: 'src/App.lex.tex', content: 'scope validation' }] });
  if (typeof context.assertCurrent !== 'function' || !context.signal) fail('invalidHostedSourcePermission');
  return sessionFor({ ...context, scope: 'turn' }, boundary);
}
export async function withHostedSourcePermission(input, operation, options = {}, fetchImpl = globalThis.fetch) {
  if (options.session !== undefined && !sessions.has(options.session)) fail('invalidHostedSourcePermission');
  const session = options.session || sessionFor({ scope: 'source', signal: options.signal }, options);
  try { return await session.run({ ...input, signal: options.signal }, operation, fetchImpl); }
  finally { if (!options.session) session.close(); }
}
