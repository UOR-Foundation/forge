// Moves a device store from BLAKE3 addresses (database version 2) to κ (version 3, address.mjs).
//
// Every object is re-addressed by its own bytes; a snapshot is spelled again by the core with its
// files' and parent's new addresses, parents first, so a version history keeps its shape. Every other
// record keeps what maps and drops what does not: a reference to an object the store never held, or a
// cached identity (rule, proof, publication or seal state) whose preimage is not stored, is stale, and
// stale state is rechecked, as an import already rechecks it. Everything runs in one transaction.
export const LEGACY = /^blake3:[0-9a-f]{64}$/;
export const MIGRATION_KEY = "migration:kappa";
const LEGACY_ANYWHERE = /blake3:[0-9a-f]{64}/;
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

function snapshotOf(bytes) {
  try {
    const value = JSON.parse(decoder.decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "entries,name,parent") return null;
    if (typeof value.name !== "string" || typeof value.parent !== "string" || !Array.isArray(value.entries)) return null;
    if (!value.entries.every((e) => Array.isArray(e) && e.length === 3 && typeof e[0] === "string" && typeof e[1] === "string" && Number.isSafeInteger(e[2]))) return null;
    return value;
  } catch { return null; }
}

/**
 * Re-address every object. `objects` maps an address to its bytes; `derive` is κ of bytes and
 * `spell` the core's snapshot preimage. Returns the new objects and the map from old to new; an
 * object that cannot be re-addressed (a snapshot naming a missing file) is left out of both.
 */
export function readdress(objects, { derive, spell }) {
  const map = new Map(), out = new Map(), visiting = new Set();
  const remap = (old) => {
    if (map.has(old)) return map.get(old);
    const bytes = objects.get(old);
    if (!(bytes instanceof Uint8Array) || visiting.has(old)) return null;
    visiting.add(old);
    let body = bytes;
    const snapshot = snapshotOf(bytes);
    if (snapshot) {
      const entries = [];
      for (const [path, key, length] of snapshot.entries) {
        const kappa = remap(key);
        if (kappa === null) { visiting.delete(old); return null; }
        entries.push({ path, kappa, bytes: length });
      }
      const parent = snapshot.parent === "" ? "" : (remap(snapshot.parent) ?? "");
      body = encoder.encode(spell({ label: snapshot.name, entries }, parent));
    }
    visiting.delete(old);
    const kappa = derive(body);
    map.set(old, kappa); out.set(kappa, body);
    return kappa;
  };
  for (const old of objects.keys()) remap(old);
  return { objects: out, map };
}

/** A record with every mapped address replaced; `stale` when a legacy address that did not map remains. */
export function rewrite(value, map) {
  let stale = false;
  const walk = (v) => {
    if (typeof v === "string") {
      if (map.has(v)) return map.get(v);
      if (LEGACY_ANYWHERE.test(v)) stale = true;
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Uint8Array) && !(v instanceof ArrayBuffer)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const out = walk(value);
  return { value: out, stale };
}

const request = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

/** Run the migration on an open database whose refs store holds MIGRATION_KEY. */
export async function migrateDatabase(db, { derive, spell }) {
  const t = db.transaction(["objects", "refs", "versions", "apps", "chats", "seals"], "readwrite");
  const done = new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || new Error("kappa migration aborted")); });
  try {
    const store = (name) => t.objectStore(name);
    const rows = async (name) => { const [keys, values] = await Promise.all([request(store(name).getAllKeys()), request(store(name).getAll())]); return keys.map((k, i) => [k, values[i]]); };
    const legacy = new Map((await rows("objects")).filter(([k]) => typeof k === "string" && LEGACY.test(k)).map(([k, v]) => [k, v instanceof Uint8Array ? v : new Uint8Array(v)]));
    const { objects, map } = readdress(legacy, { derive, spell });
    for (const key of legacy.keys()) store("objects").delete(key);
    for (const [key, bytes] of objects) store("objects").put(bytes, key);
    for (const [key, value] of await rows("refs")) {
      if (key === MIGRATION_KEY) continue;
      const { value: next, stale } = rewrite(value, map);
      if (stale || (typeof key === "string" && LEGACY_ANYWHERE.test(key))) store("refs").delete(key);
      else store("refs").put(next, key);
    }
    for (const [key, list] of await rows("versions")) {
      if (!Array.isArray(list)) continue;
      store("versions").put(list.filter((v) => map.has(v?.oid)).map((v) => rewrite(v, map).value), key);
    }
    for (const [key, app] of await rows("apps")) {
      if (!app || typeof app !== "object") continue;
      const next = {};
      for (const [field, value] of Object.entries(app)) { const r = rewrite(value, map); next[field] = r.stale ? null : r.value; }
      store("apps").put(next, key);
    }
    for (const [key, chat] of await rows("chats")) store("chats").put(rewrite(chat, map).value, key);
    store("seals").clear();
    store("refs").delete(MIGRATION_KEY);
  } catch (error) { try { t.abort(); } catch {} throw error; }
  await done;
  return true;
}
