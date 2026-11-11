// FoundrySpecification.projectEditBoundary: prepare, compare, atomically commit.
import { prepareExistingProject } from "./project-creation.mjs";
const failure = code => Object.assign(new Error(code === "projectMutationCancelled" ? "Project mutation cancelled" : code === "projectEditConflict" ? "Project changed during edit" : code === "invalidProjectEdit" ? "Invalid project edit" : code === "projectEditStateInvalid" ? "Project state is invalid" : "Project edit storage failed"), { code });
const validPath = path => typeof path === "string" && path.length > 0 && !/[\\\u0000-\u001f:]/.test(path) && path.split("/").every(part => part && part !== "." && part !== "..");
const dependencyShape = value => Array.isArray(value) && value.length <= 128 && value.every(item => typeof item === "string" && item.length <= 256);
const range = id => IDBKeyRange.bound(`${id}:`, `${id};`, false, true);
export function captureProjectSource(db, appId) {
  return new Promise((resolve, reject) => {
    let t, app, reference; const files = [];
    const refuse = code => { if (t) { try { t.abort(); } catch {} } reject(failure(code)); };
    try {
      t = db.transaction(["apps", "files", "refs"], "readonly");
      t.onabort = () => reject(failure("projectEditStorageFailed")); t.onerror = () => refuse("projectEditStorageFailed");
      t.oncomplete = () => {
        if (!app || typeof app.name !== "string" || typeof reference !== "string" || !/^blake3:[0-9a-f]{64}$/.test(reference) || !dependencyShape(app.extraDeps || [])) reject(failure("projectEditStateInvalid"));
        else resolve({ name: app.name, reference, files, dependencies: structuredClone(app.extraDeps || []) });
      };
      const aq = t.objectStore("apps").get(appId), rq = t.objectStore("refs").get(`${appId}:main`);
      aq.onsuccess = () => { app = aq.result; }; rq.onsuccess = () => { reference = rq.result; };
      const q = t.objectStore("files").openCursor(range(appId));
      q.onsuccess = () => {
        try {
          const cursor = q.result; if (!cursor) return;
          files.push([cursor.key.slice(String(appId).length + 1), cursor.value]);
          if (files.length > 1000) { refuse("projectEditStateInvalid"); return; }
          cursor.continue();
        } catch { refuse("projectEditStorageFailed"); }
      };
    } catch { refuse("projectEditStorageFailed"); }
  });
}
export function commitPreparedProject(db, appId, changedPaths, captured, prepared, { signal, dependencies, message, name, recordVersion = true, rulesUpdate } = {}) {
  return new Promise((resolve, reject) => {
    let t, app, reference, currentRules, appRead = false, refRead = false, rulesRead = !rulesUpdate, filesRead = false, failed = false;
    const rules = rulesUpdate ? structuredClone(rulesUpdate) : null;
    const original = new Map(captured.files); let seen = 0;
    const clean = () => signal?.removeEventListener("abort", cancelled);
    const cancelled = () => refuse("projectMutationCancelled");
    const refuse = code => { failed = true; clean(); if (t) { try { t.abort(); } catch {} } reject(failure(code)); };
    try {
      if (signal?.aborted) { refuse("projectMutationCancelled"); return; }
      signal?.addEventListener("abort", cancelled, { once: true });
      t = db.transaction(["apps", "files", "objects", "refs", "versions"], "readwrite");
      t.onabort = () => { clean(); reject(failure(signal?.aborted ? "projectMutationCancelled" : "projectEditStorageFailed")); }; t.onerror = () => refuse("projectEditStorageFailed");
      t.oncomplete = () => { clean(); if (failed) reject(failure("projectEditStorageFailed")); else resolve(prepared.oid); };
      const write = () => {
        if (failed || !appRead || !refRead || !rulesRead || !filesRead) return;
        if (!app || app.name !== captured.name || reference !== captured.reference || seen !== original.size || (!dependencyShape(app.extraDeps || []) || JSON.stringify(app.extraDeps || []) !== JSON.stringify(captured.dependencies))) { refuse("projectEditConflict"); return; }
        if (rules && JSON.stringify(currentRules) !== JSON.stringify(rules.expected)) { refuse("projectEditConflict"); return; }
        try {
          const q = t.objectStore("versions").get(appId);
          q.onsuccess = () => {
            try {
              if (!Array.isArray(q.result)) { refuse("projectEditStateInvalid"); return; }
              const at = new Date().toISOString();
              const files = new Map(prepared.files);
              for (const path of changedPaths) {
                if (files.has(path)) t.objectStore("files").put(files.get(path), `${appId}:${path}`);
                else t.objectStore("files").delete(`${appId}:${path}`);
              }
              for (const [key, bytes] of prepared.objects) t.objectStore("objects").put(bytes, key);
              t.objectStore("refs").put(prepared.oid, `${appId}:main`);
              if (rules) t.objectStore("refs").put(rules.state, `prism:${appId}`);
              else if (changedPaths.includes("prism/spec.json")) t.objectStore("refs").delete(`prism:${appId}`);
              if (recordVersion) t.objectStore("versions").put([{ oid: prepared.oid, message: message || `Edit ${changedPaths.join(", ")}`, timestamp: Math.floor(Date.parse(at) / 1000), dbTimestamp: null, isFavorite: false, note: null }, ...q.result], appId);
              t.objectStore("apps").put({ ...app, ...(name === undefined ? {} : { name, path: name }), ...(dependencies ? { extraDeps: dependencies } : {}), updatedAt: at }, appId);
            } catch { refuse("projectEditStorageFailed"); }
          };
        } catch { refuse("projectEditStorageFailed"); }
      };
      if (rules) {
        const status = t.objectStore("refs").get(`prism:${appId}`);
        status.onsuccess = () => { currentRules = status.result; rulesRead = true; write(); };
      }
      const aq = t.objectStore("apps").get(appId), rq = t.objectStore("refs").get(`${appId}:main`);
      aq.onsuccess = () => { app = aq.result; appRead = true; write(); };
      rq.onsuccess = () => { reference = rq.result; refRead = true; write(); };
      const q = t.objectStore("files").openCursor(range(appId));
      q.onsuccess = () => {
        try {
          const cursor = q.result;
          if (!cursor) { filesRead = true; write(); return; }
          const path = cursor.key.slice(String(appId).length + 1);
          if (!original.has(path) || original.get(path) !== cursor.value) { refuse("projectEditConflict"); return; }
          seen++; cursor.continue();
        } catch { refuse("projectEditStorageFailed"); }
      };
    } catch { refuse("projectEditStorageFailed"); }
  });
}
export async function editStoredProject(db, input, boundary) {
  let edit;
  try { edit = structuredClone(input); } catch { throw failure("invalidProjectEdit"); }
  if (!edit || !Number.isSafeInteger(edit.appId) || edit.appId < 1 || !validPath(edit.filePath) || typeof edit.content !== "string") throw failure("invalidProjectEdit");
  const captured = await captureProjectSource(db, edit.appId);
  const files = Object.fromEntries(captured.files); Object.defineProperty(files, edit.filePath, { value: edit.content, enumerable: true, configurable: true, writable: true });
  const prepared = await prepareExistingProject({ name: captured.name, files }, boundary, captured.reference);
  return commitPreparedProject(db, edit.appId, [edit.filePath], captured, prepared);
}
