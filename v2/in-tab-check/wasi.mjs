// A WASI preview 1 host over a file system held in memory. It gives a WebAssembly module the 25 calls LexLean's
// binary imports and nothing else: no network, no clock beyond a counter, no host file. Each call gets its own file
// tree, descriptors and output; the instance is kept, so what LexLean computes once per process is computed once.
// Runs unchanged in a worker and in Node.

const E = { ok: 0, badf: 8, exist: 20, inval: 28, isdir: 31, noent: 44, nosys: 52, notdir: 54, notempty: 55, notsup: 58 };
const DIR = 3, FILE = 4, CHAR = 2;
const enc = new TextEncoder(), dec = new TextDecoder();

class Exit extends Error { constructor(code) { super(`exit ${code}`); this.code = code; } }

let serial = 1;
const dir = () => ({ ino: serial++, entries: new Map() });
const file = (data = new Uint8Array(0)) => ({ ino: serial++, data, size: data.length });

// files: Map or object of absolute path -> Uint8Array | string. Returns the root directory node.
export function tree(files) {
  const root = dir();
  for (const [path, value] of files instanceof Map ? files : Object.entries(files)) {
    const parts = path.split("/").filter(Boolean);
    let at = root;
    for (const name of parts.slice(0, -1)) {
      if (!at.entries.has(name)) at.entries.set(name, dir());
      at = at.entries.get(name);
    }
    at.entries.set(parts.at(-1), file(typeof value === "string" ? enc.encode(value) : value));
  }
  return root;
}

// Every regular file under a node, as path -> bytes.
export function listing(node, prefix = "", out = new Map()) {
  for (const [name, child] of node.entries) {
    if (child.entries) listing(child, `${prefix}/${name}`, out);
    else out.set(`${prefix}/${name}`, child.data.subarray(0, child.size));
  }
  return out;
}

// Instantiates a compiled module. Returns { call(name, { args, root }), memoryBytes() }; call returns
// { code, trap, stdout, stderr, root, calls }. A module with `_start` is a command: call("_start") runs it once.
export function open(module) {
  let memory;
  const view = () => new DataView(memory.buffer);
  const bytes = () => new Uint8Array(memory.buffer);
  let out, fds, nextFd, tick, seed, calls, argv, envp, stdin;
  const begin = ({ args = [], env = {}, root = dir(), input = new Uint8Array(0) }) => {
    out = { 1: [], 2: [] };
    fds = new Map([[0, { stdin: 0 }], [1, { out: 1 }], [2, { out: 2 }], [3, { node: root }]]);
    nextFd = 4; tick = 0n; seed = 0x9e3779b9; calls = {}; stdin = input;
    argv = strings(args); envp = strings(Object.entries(env).map(([k, v]) => `${k}=${v}`));
    return root;
  };

  const text = (ptr, len) => dec.decode(bytes().subarray(ptr, ptr + len));
  // Resolves a path below a directory handle. Returns { parent, name, node } or an error number.
  const resolve = (fd, ptr, len) => {
    const base = fds.get(fd);
    if (!base?.node) return E.badf;
    if (!base.node.entries) return E.notdir;
    const stack = [base.node];
    const parts = text(ptr, len).split("/").filter((p) => p && p !== ".");
    if (!parts.length) return { parent: null, name: "", node: base.node };
    for (let i = 0; i < parts.length; i++) {
      const top = stack.at(-1);
      if (parts[i] === "..") { if (stack.length === 1) return E.noent; stack.pop(); continue; }
      if (!top.entries) return E.notdir;
      if (i === parts.length - 1) return { parent: top, name: parts[i], node: top.entries.get(parts[i]) };
      const next = top.entries.get(parts[i]);
      if (!next) return E.noent;
      stack.push(next);
    }
    return { parent: null, name: "", node: stack.at(-1) };
  };
  const stat = (ptr, node) => {
    const v = view();
    for (let i = 0; i < 64; i += 8) v.setBigUint64(ptr + i, 0n, true);
    v.setBigUint64(ptr + 8, BigInt(node.ino ?? 0), true);
    v.setUint8(ptr + 16, node.entries ? DIR : node.data ? FILE : CHAR);
    v.setBigUint64(ptr + 24, 1n, true);
    v.setBigUint64(ptr + 32, BigInt(node.size ?? 0), true);
  };
  const iovecs = (ptr, count) => {
    const v = view(), list = [];
    for (let i = 0; i < count; i++) list.push([v.getUint32(ptr + 8 * i, true), v.getUint32(ptr + 8 * i + 4, true)]);
    return list;
  };
  const strings = (list) => list.map((s) => enc.encode(s + "\0"));
  const sizes = (get) => (countPtr, sizePtr) => {
    const v = view(), list = get();
    v.setUint32(countPtr, list.length, true);
    v.setUint32(sizePtr, list.reduce((n, s) => n + s.length, 0), true);
    return E.ok;
  };
  const fill = (get) => (tablePtr, bufPtr) => {
    for (const s of get()) { view().setUint32(tablePtr, bufPtr, true); bytes().set(s, bufPtr); tablePtr += 4; bufPtr += s.length; }
    return E.ok;
  };

  const wasi = {
    args_sizes_get: sizes(() => argv), args_get: fill(() => argv),
    environ_sizes_get: sizes(() => envp), environ_get: fill(() => envp),
    // Time is a counter: a check must not depend on when it ran, and a worker without a clock cannot time anything else.
    clock_time_get: (_id, _precision, ptr) => { tick += 1000000n; view().setBigUint64(ptr, tick, true); return E.ok; },
    // A fixed sequence, so hash-map order and temporary names repeat exactly from run to run.
    random_get: (ptr, len) => {
      const b = bytes();
      for (let i = 0; i < len; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; b[ptr + i] = seed & 255; }
      return E.ok;
    },
    sched_yield: () => E.ok,
    proc_exit: (code) => { throw new Exit(code); },
    fd_close: (fd) => (fds.delete(fd) ? E.ok : E.badf),
    fd_sync: (fd) => (fds.has(fd) ? E.ok : E.badf),
    fd_fdstat_get: (fd, ptr) => {
      const h = fds.get(fd);
      if (!h) return E.badf;
      const v = view();
      v.setUint8(ptr, h.node ? (h.node.entries ? DIR : FILE) : CHAR);
      v.setUint16(ptr + 2, h.append ? 1 : 0, true);
      v.setBigUint64(ptr + 8, 0xffffffffffffffffn, true);
      v.setBigUint64(ptr + 16, 0xffffffffffffffffn, true);
      return E.ok;
    },
    fd_filestat_get: (fd, ptr) => { const h = fds.get(fd); if (!h) return E.badf; stat(ptr, h.node ?? {}); return E.ok; },
    fd_prestat_get: (fd, ptr) => {
      if (fd !== 3) return E.badf;
      view().setUint8(ptr, 0); view().setUint32(ptr + 4, 1, true);
      return E.ok;
    },
    fd_prestat_dir_name: (fd, ptr) => { if (fd !== 3) return E.badf; bytes()[ptr] = 47; return E.ok; },
    fd_read: (fd, iovs, count, donePtr) => {
      const h = fds.get(fd);
      if (!h) return E.badf;
      if (h.node?.entries) return E.isdir;
      const source = h.node ? h.node.data.subarray(0, h.node.size) : h.stdin !== undefined ? stdin : null;
      if (!source) return E.badf;
      let done = 0, at = h.node ? h.at : h.stdin;
      for (const [ptr, len] of iovecs(iovs, count)) {
        const piece = source.subarray(at, at + len);
        bytes().set(piece, ptr);
        at += piece.length; done += piece.length;
        if (piece.length < len) break;
      }
      if (h.node) h.at = at; else h.stdin = at;
      view().setUint32(donePtr, done, true);
      return E.ok;
    },
    fd_write: (fd, iovs, count, donePtr) => {
      const h = fds.get(fd);
      if (!h) return E.badf;
      let done = 0;
      for (const [ptr, len] of iovecs(iovs, count)) {
        const piece = bytes().slice(ptr, ptr + len);
        if (h.out) out[h.out].push(piece);
        else if (h.node?.data) {
          const node = h.node, at = h.append ? node.size : h.at;
          if (at + len > node.data.length) { const grown = new Uint8Array(Math.max(2 * node.data.length, at + len, 256)); grown.set(node.data.subarray(0, node.size)); node.data = grown; }
          node.data.set(piece, at);
          node.size = Math.max(node.size, at + len);
          h.at = at + len;
        } else return E.badf;
        done += len;
      }
      view().setUint32(donePtr, done, true);
      return E.ok;
    },
    fd_readdir: (fd, buf, bufLen, cookie, usedPtr) => {
      const h = fds.get(fd);
      if (!h?.node?.entries) return E.badf;
      const names = [...h.node.entries.keys()].sort();
      let used = 0;
      for (let i = Number(cookie); i < names.length && used < bufLen; i++) {
        const child = h.node.entries.get(names[i]), name = enc.encode(names[i]);
        const entry = new Uint8Array(24 + name.length), v = new DataView(entry.buffer);
        v.setBigUint64(0, BigInt(i + 1), true);
        v.setBigUint64(8, BigInt(child.ino), true);
        v.setUint32(16, name.length, true);
        v.setUint8(20, child.entries ? DIR : FILE);
        entry.set(name, 24);
        const take = Math.min(entry.length, bufLen - used);
        bytes().set(entry.subarray(0, take), buf + used);
        used += take;
      }
      view().setUint32(usedPtr, used, true);
      return E.ok;
    },
    path_filestat_get: (fd, _flags, ptr, len, statPtr) => {
      const r = resolve(fd, ptr, len);
      if (typeof r === "number") return r;
      if (!r.node) return E.noent;
      stat(statPtr, r.node);
      return E.ok;
    },
    path_open: (fd, _dirflags, ptr, len, oflags, _rights, _inheriting, fdflags, fdPtr) => {
      const r = resolve(fd, ptr, len);
      if (typeof r === "number") return r;
      let node = r.node;
      if (node && (oflags & 1) && (oflags & 4)) return E.exist;
      if (!node) {
        if (!(oflags & 1) || !r.parent) return E.noent;
        node = file();
        r.parent.entries.set(r.name, node);
      }
      if ((oflags & 2) && !node.entries) return E.notdir;
      if ((oflags & 8) && node.data) node.size = 0;
      fds.set(nextFd, { node, at: 0, append: !!(fdflags & 1) });
      view().setUint32(fdPtr, nextFd++, true);
      return E.ok;
    },
    path_create_directory: (fd, ptr, len) => {
      const r = resolve(fd, ptr, len);
      if (typeof r === "number") return r;
      if (r.node) return E.exist;
      if (!r.parent) return E.noent;
      r.parent.entries.set(r.name, dir());
      return E.ok;
    },
    path_unlink_file: (fd, ptr, len) => {
      const r = resolve(fd, ptr, len);
      if (typeof r === "number") return r;
      if (!r.node) return E.noent;
      if (r.node.entries) return E.isdir;
      r.parent.entries.delete(r.name);
      return E.ok;
    },
    path_remove_directory: (fd, ptr, len) => {
      const r = resolve(fd, ptr, len);
      if (typeof r === "number") return r;
      if (!r.node) return E.noent;
      if (!r.node.entries) return E.notdir;
      if (r.node.entries.size) return E.notempty;
      if (!r.parent) return E.inval;
      r.parent.entries.delete(r.name);
      return E.ok;
    },
    path_rename: (fd, ptr, len, toFd, toPtr, toLen) => {
      const from = resolve(fd, ptr, len), to = resolve(toFd, toPtr, toLen);
      if (typeof from === "number") return from;
      if (typeof to === "number") return to;
      if (!from.node) return E.noent;
      if (!from.parent || !to.parent) return E.inval;
      if (to.node?.entries?.size) return E.notempty;
      from.parent.entries.delete(from.name);
      to.parent.entries.set(to.name, from.node);
      return E.ok;
    },
    // This file system has no symbolic or hard links: nothing is one, and none can be made.
    path_readlink: (fd, ptr, len) => { const r = resolve(fd, ptr, len); return typeof r === "number" ? r : r.node ? E.inval : E.noent; },
    path_link: () => E.notsup,
  };
  const counted = Object.fromEntries(Object.entries(wasi).map(([name, fn]) => [name, (...a) => { calls[name] = (calls[name] ?? 0) + 1; return fn(...a); }]));
  // A module that asks for a call not listed here is refused at instantiation, by name.
  for (const want of WebAssembly.Module.imports(module)) {
    if (want.module !== "wasi_snapshot_preview1" || !(want.name in wasi)) throw Object.assign(new Error(`the module imports ${want.module}.${want.name}, which this host does not provide`), { code: "ITC_IMPORT" });
  }
  begin({});
  const instance = new WebAssembly.Instance(module, { wasi_snapshot_preview1: counted });
  memory = instance.exports.memory;
  instance.exports._initialize?.();
  const join = (parts) => { const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { all.set(p, at); at += p.length; } return dec.decode(all); };
  let dead = null;
  return {
    memoryBytes: () => memory.buffer.byteLength,
    call(name, options = {}) {
      // After a trap the instance's memory is in no known state, so it answers nothing more.
      if (dead) throw Object.assign(new Error(`the instance trapped earlier: ${dead.message}`), { code: "ITC_DEAD" });
      const root = begin(options);
      let code = 0, trap = null;
      try { code = instance.exports[name]() ?? 0; } catch (e) { if (e instanceof Exit) code = e.code; else { trap = dead = e; code = -1; } }
      if (name === "_start") dead ??= new Error("a command runs once");
      return { code, trap, stdout: join(out[1]), stderr: join(out[2]), root, calls };
    },
  };
}

// Runs a command module once, in a new instance.
export const run = (module, options) => open(module).call("_start", options);
