// FoundrySpecification.previewPermissionBoundary: consent binds a source and exact origins.
const messages = {
  invalidPreviewPermission: "Invalid preview permission",
  previewPermissionDenied: "Preview permission declined",
  previewPermissionExpired: "Preview approval expired; allow the preview again",
  previewPermissionOffline: "Networked previews are unavailable while offline",
  previewPermissionUnavailable: "Preview permission controls are unavailable",
  previewPermissionChanged: "Preview permission changed; review the current request again",
  previewPermissionStorageFailed: "Preview permission could not be saved or revoked",
};
export const previewPermissionFailure = code => Object.assign(new Error(messages[code] || messages.previewPermissionUnavailable), { code: Object.hasOwn(messages, code) ? code : "previewPermissionUnavailable" });
export function describePreview(input) {
  const fail = () => { throw previewPermissionFailure("invalidPreviewPermission"); };
  if (!input || typeof input.id !== "string" || !/^[A-Za-z0-9:_-]{1,256}$/.test(input.id) || typeof input.source !== "string" || !/^blake3:[0-9a-f]{64}$/.test(input.source) || !Array.isArray(input.endpoints) || input.endpoints.length > 32) fail();
  const endpoints = input.endpoints.map(origin => {
    if (typeof origin !== "string" || origin.length > 255 || !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]{1,5})?$/.test(origin)) fail();
    try { if (new URL(origin).origin !== origin) fail(); } catch { fail(); }
    return origin;
  });
  if (new Set(endpoints).size !== endpoints.length) fail();
  return Object.freeze({ id: input.id, source: input.source, endpoints: Object.freeze(endpoints) });
}
export function previewPermissionRecord(permission, at = Date.now()) {
  if (!Number.isFinite(at) || !Number.isFinite(permission?.expires) || permission.expires <= at || permission.expires > at + 300000) throw previewPermissionFailure("previewPermissionExpired");
  const d = describePreview(permission.disclosure), expires = permission.expires;
  return { serve: true, network: { endpoints: [...d.endpoints], denied: [] }, previewConsent: { profile: "foundry/preview-consent/1", id: d.id, source: d.source, grantedAt: at, ...(permission.purpose === "portable-build" ? { purpose: "portable-build", expires } : {}) } };
}
export async function commitPreviewPermission(db, id, permission, expected) {
  const record = previewPermissionRecord(permission), expires = permission.expires;
  let previous;
  try { previous = structuredClone(expected); } catch { throw previewPermissionFailure("invalidPreviewPermission"); }
  if (record.previewConsent.id !== id) throw previewPermissionFailure("invalidPreviewPermission");
  return new Promise((resolve,reject)=>{
    let transaction, refusal="previewPermissionStorageFailed";
    try {
      transaction=db.transaction("refs","readwrite");
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(previewPermissionFailure(refusal));
      transaction.onerror=()=>{try{transaction.abort();}catch{}};
      const store=transaction.objectStore("refs"), request=store.get("capabilities:"+id);
      request.onsuccess=()=>{
        try {
          if (JSON.stringify(request.result)!==JSON.stringify(previous)) {refusal="previewPermissionChanged";transaction.abort();return;}
          // Revalidate time inside the transaction, after any competing revocation.
          if (Date.now() >= expires) {refusal="previewPermissionExpired";transaction.abort();return;}
          store.put(record,"capabilities:"+id);
        } catch (error) {refusal=Object.hasOwn(messages,error?.code)?error.code:"previewPermissionStorageFailed";transaction.abort();}
      };
    } catch {try{transaction?.abort();}catch{}reject(previewPermissionFailure("previewPermissionStorageFailed"));}
  });
}
const element = (document, tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const styleDialog = node => { node.style.cssText = "max-width:min(90vw,42rem);max-height:85vh;overflow:auto;padding:1.5rem;border-radius:0.75rem;color-scheme:light dark;font:inherit"; };
export function authorizePreview(input, { document = globalThis.document, online = () => globalThis.navigator.onLine, timeoutMs = 300000 } = {}) {
  let disclosure;
  try {
    disclosure = describePreview(input);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw previewPermissionFailure("invalidPreviewPermission");
    if (!online()) throw previewPermissionFailure("previewPermissionOffline");
  } catch (error) { return Promise.reject(messages[error?.code] ? error : previewPermissionFailure("previewPermissionUnavailable")); }
  return new Promise((resolve, reject) => {
    let dialog, timer, settled = false; const previous = document?.activeElement, expires = Date.now() + timeoutMs;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); dialog?.remove(); previous?.focus?.(); if (error) reject(previewPermissionFailure(error)); else resolve(Object.freeze({ disclosure, expires })); };
    try {
      dialog = element(document,"dialog"); styleDialog(dialog); dialog.setAttribute("aria-label","Review preview permissions");
      dialog.append(element(document,"h2","Allow this preview to contact these destinations?"));
      dialog.append(element(document,"p","The preview executes generated code. These destinations can receive requests and data sent by that code, your IP address and browser request information. They may retain transferred data. No configured AI provider key is included in this permission."));
      dialog.append(element(document,"p",`Captured source: ${disclosure.source}`));
      const list = element(document,"ul"); for (const origin of disclosure.endpoints) list.append(element(document,"li",origin)); dialog.append(list);
      dialog.append(element(document,"p","Approval covers this preview build. Use Preview permissions to revoke its stored grant later. Revocation prevents future authorized requests but cannot recall data or guarantee that remote work stops."));
      const deny = element(document,"button","Don't allow"), allow = element(document,"button","Allow this preview"); deny.type = allow.type = "button"; deny.autofocus = true;
      deny.addEventListener("click",()=>finish("previewPermissionDenied")); dialog.addEventListener("cancel",event=>{event.preventDefault();finish("previewPermissionDenied");});
      allow.addEventListener("click",()=>{ if (Date.now() >= expires) finish("previewPermissionExpired"); else if (!online()) finish("previewPermissionOffline"); else finish(); });
      dialog.append(deny,allow); document.body.append(dialog); timer=setTimeout(()=>finish("previewPermissionExpired"),timeoutMs); dialog.showModal(); deny.focus();
    } catch { finish("previewPermissionUnavailable"); }
  });
}
export function mountPreviewPermissions({ list, revoke, document = globalThis.document }) {
  const button = element(document,"button","Preview permissions"); button.type="button";
  button.style.cssText="position:fixed;bottom:0.5rem;left:0.5rem;z-index:2147483646;padding:0.5rem;background:Canvas;color:CanvasText;border:1px solid;border-radius:0.5rem;font:inherit";
  button.addEventListener("click",async()=>{
    let dialog;
    try {
      dialog=element(document,"dialog");styleDialog(dialog);dialog.setAttribute("aria-label","Stored preview permissions");
      dialog.append(element(document,"h2","Stored preview permissions"));
      const status=element(document,"p","Loading permissions");status.setAttribute("role","status");dialog.append(status);
      const close=element(document,"button","Close permissions");close.type="button";const dismiss=()=>{dialog.remove();button.focus();};close.addEventListener("click",dismiss);dialog.addEventListener("cancel",event=>{event.preventDefault();dismiss();});dialog.append(close);document.body.append(dialog);dialog.showModal();close.focus();
      const rows=await list();status.textContent=rows.length?"Revoke access to stop future authorized preview requests.":"No stored preview network permissions.";
      for (const row of rows) {
        const section=element(document,"section"), label=element(document,"p",`${row.source}\n${row.endpoints.join(", ")}`), remove=element(document,"button","Revoke preview");remove.type="button";
        remove.addEventListener("click",async()=>{remove.disabled=true;try{await revoke(row.id);section.remove();status.textContent="Preview permission revoked";close.focus();}catch{status.textContent=messages.previewPermissionStorageFailed;remove.disabled=false;}});
        section.append(label,remove);dialog.append(section);
      }
    } catch { if (dialog) dialog.append(element(document,"p",messages.previewPermissionStorageFailed)); }
  });
  document.body.append(button); return button;
}
