// Mechanism 3: a content-addressed store. Two backends share one interface; the model writes
// every preimage and decides every read and restore. A backend only moves bytes.
import { addressOf, natToHex, hexToNat, digestToNat, list, ReuseError } from "./model.mjs";

const S = "Store::";

// backend: { read(kind, hex) -> Promise<Uint8Array | null>, write(kind, hex, bytes) -> Promise<void> }
export function createStore(model, backend) {
  const blobAddress = (bytes) => addressOf(model.call(S + "blobPreimage", bytes));

  async function put(bytes) {
    const hex = natToHex(blobAddress(bytes));
    await backend.write("blob", hex, bytes);
    return hex;
  }

  async function get(hex) {
    const expected = hexToNat(hex);
    const bytes = await backend.read("blob", hex);
    if (!bytes) throw new ReuseError("store.missing", hex);
    const derived = blobAddress(bytes);
    if (model.call(S + "read", expected, derived).c !== S + "Read.accepted") throw new ReuseError("store.mismatch", hex);
    return bytes;
  }

  // A snapshot is the set of addresses a project state consists of, itself addressed.
  async function snapshot(hexes) {
    const members = list(hexes.map(hexToNat));
    const form = model.call(S + "snapshotForm", members);
    if (form.c !== S + "SnapshotForm.canonical") throw new ReuseError("store.duplicateMember");
    const preimage = model.call(S + "snapshotPreimage", members);
    const hex = natToHex(addressOf(preimage));
    await backend.write("snapshot", hex, preimage);
    return hex;
  }

  // Undo, restore and share are this one call on one address.
  async function restore(hex) {
    const expected = hexToNat(hex);
    const stored = await backend.read("snapshot", hex);
    if (!stored) throw new ReuseError("store.missing", hex);
    // Parsing is untrusted: the address is re-derived from the preimage the model writes for
    // the parsed members, so a wrong parse or a tampered file cannot pass.
    const members = parseSnapshot(stored);
    const derived = addressOf(model.call(S + "snapshotPreimage", list(members)));
    let membersAccepted = 1n;
    const blobs = new Map();
    for (const m of members) {
      try { blobs.set(natToHex(m), await get(natToHex(m))); } catch { membersAccepted = 0n; }
    }
    if (model.call(S + "restore", expected, derived, membersAccepted).c !== S + "Read.accepted") throw new ReuseError("store.mismatch", hex);
    return blobs;
  }

  return { put, get, snapshot, restore, blobAddress };
}

// Layout written by Store::snapshotPreimage: tag, 8-byte count, then 32-byte big-endian members.
const TAG = new TextEncoder().encode("prism/reuse/snapshot/1\n").length;
function parseSnapshot(bytes) {
  let count = 0;
  for (let i = TAG; i < TAG + 8 && i < bytes.length; i++) count = count * 256 + bytes[i];
  const out = [];
  for (let i = 0, at = TAG + 8; i < count && at + 32 <= bytes.length; i++, at += 32) out.push(digestToNat(bytes.subarray(at, at + 32)));
  return out;
}

export function memoryBackend() {
  const maps = { blob: new Map(), snapshot: new Map() };
  return {
    maps,
    read: async (kind, hex) => maps[kind].get(hex) ?? null,
    write: async (kind, hex, bytes) => { maps[kind].set(hex, bytes.slice()); },
  };
}

// Origin Private File System: one file per address under prism-reuse/<kind>/. Works in a window
// and in a worker (async API). Writes go to a temporary name and are renamed into place when the
// browser supports `move`, so a torn write leaves no file at the address.
export async function opfsBackend(root) {
  const base = await (root ?? (await navigator.storage.getDirectory())).getDirectoryHandle("prism-reuse", { create: true });
  const dirs = { blob: await base.getDirectoryHandle("blob", { create: true }), snapshot: await base.getDirectoryHandle("snapshot", { create: true }) };
  return {
    async read(kind, hex) {
      try { const file = await (await dirs[kind].getFileHandle(hex)).getFile(); return new Uint8Array(await file.arrayBuffer()); }
      catch (e) { if (e.name === "NotFoundError") return null; throw new ReuseError("store.backend", e.message); }
    },
    async write(kind, hex, bytes) {
      const temporary = await dirs[kind].getFileHandle(hex + ".partial", { create: true });
      const w = await temporary.createWritable();
      await w.write(bytes); await w.close();
      if (typeof temporary.move === "function") await temporary.move(dirs[kind], hex);
      else { const h = await dirs[kind].getFileHandle(hex, { create: true }); const w2 = await h.createWritable(); await w2.write(bytes); await w2.close(); await dirs[kind].removeEntry(hex + ".partial"); }
    },
  };
}
