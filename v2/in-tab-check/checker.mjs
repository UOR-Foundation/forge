// The in-tab checker: LexLean's own check, run as WebAssembly over a file system held in memory. No rule lives here.
// This file assembles the project the SDK image would see, runs `lexlean lock` and `lexlean check --all` in it, and
// reads back the result. It needs no network once it holds the checker's bytes, and it is given none.
//
// Addresses are Hologram content addresses on the sha256 axis ("sha256:<hex>"): the browser hashes natively, at about
// a gigabyte a second, where BLAKE3 in script takes two seconds for these bytes.
import { open, tree, listing } from "./wasi.mjs";

const enc = new TextEncoder();
const fail = (code, message) => Object.assign(new Error(message), { code });
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function address(bytes) {
  return "sha256:" + hex(await crypto.subtle.digest("SHA-256", typeof bytes === "string" ? enc.encode(bytes) : bytes));
}

// The address of a computation: a domain, then each part with its length, so no two lists of parts share a preimage.
export async function derive(domain, parts) {
  const chunks = [enc.encode(domain)];
  for (const part of parts) { const b = enc.encode(part); chunks.push(enc.encode(`\0${b.length}\0`), b); }
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return address(all);
}

const moduleName = (source) => source.match(/^\\begin\{lexlean\}\{([^}\n]+)\}/m)?.[1] ?? "App";
const modulePath = (name) => `src/${name.split(".").join("/")}.lex.tex`;
const shape = (d) => ({
  code: d.code, severity: d.severity, message: d.message, path: d.primary?.path,
  line: d.primary?.line_start, column: d.primary?.column_start, endLine: d.primary?.line_end, endColumn: d.primary?.column_end,
  byteStart: d.primary?.byte_start, byteEnd: d.primary?.byte_end,
});

// manifest: { checker: address, pack: address, lexlean: { version, semantics } }. wasm and pack are bytes.
// Refuses bytes whose address is not the manifest's, and a checker that does not report the manifest's compiler.
// store, when given, is { get(key), put(key, value) } over strings and may be asynchronous; it is never trusted.
export async function load({ wasm, pack, manifest, store = null, recycleBytes = 1 << 30 }) {
  const t0 = performance.now();
  const [wasmAddress, packAddress] = await Promise.all([address(wasm), address(pack)]);
  if (wasmAddress !== manifest.checker) throw fail("ITC_ADDRESS", `the checker's bytes are ${wasmAddress}, not ${manifest.checker}`);
  if (packAddress !== manifest.pack) throw fail("ITC_ADDRESS", `the library pack is ${packAddress}, not ${manifest.pack}`);
  const tHash = performance.now();
  const module = await WebAssembly.compile(wasm);
  const tCompile = performance.now();
  const fixed = JSON.parse(new TextDecoder().decode(pack)).files;
  const base = Object.entries(fixed).map(([path, text]) => [path, enc.encode(text)]);
  let instance = open(module);
  const tOpen = performance.now();

  const call = (name, args, files) => {
    if (instance.memoryBytes() > recycleBytes) instance = open(module);
    let r;
    try { r = instance.call(name, { args: ["lexlean", ...args], root: tree(files) }); }
    catch (e) { instance = open(module); throw e; }
    if (r.trap) { instance = open(module); throw fail("ITC_TRAP", `the checker stopped: ${r.trap.message}`); }
    return r;
  };

  // The checker says what it is. A build of another LexLean is refused here, whatever its address.
  const said = call("run", ["--version"], new Map()).stdout;
  const reported = { version: said.match(/^lexlean (\S+)/m)?.[1], semantics: said.match(/^compiler-semantics (\S+)/m)?.[1] };
  if (reported.version !== manifest.lexlean.version || reported.semantics !== manifest.lexlean.semantics) {
    throw fail("ITC_VERSION", `the checker reports lexlean ${reported.version} (${reported.semantics}); the manifest names ${manifest.lexlean.version} (${manifest.lexlean.semantics})`);
  }
  const by = { route: "in-tab", checker: wasmAddress, pack: packAddress, lexlean: reported.version, semantics: reported.semantics };
  const tVersion = performance.now();
  const locks = new Map(), memo = new Map();

  const project = (spec, extras) => {
    const own = [spec, ...extras].map((source) => ({ name: moduleName(source), source }));
    const files = new Map(base.map(([path, bytes]) => [`/${path}`, bytes]));
    for (const m of own) files.set(`/${modulePath(m.name)}`, enc.encode(m.source));
    const toml = fixed["lexlean.toml"].replace(/^entrypoints = .*$/m, `entrypoints = ["${modulePath(own[0].name)}"]`);
    files.set("/lexlean.toml", enc.encode(toml));
    return { own, files, toml };
  };

  // One uncached check: lock (once per configuration), check, and on a pass the data form of each of the author's modules.
  // scope "author" names the author's modules, so LexLean checks them and all they import; scope "all" is
  // `check --all`, which also checks the library modules nothing imports. The library is fixed by the pack's address
  // and passes `check --all` on its own (test.mjs holds that), so the two differ only in time.
  const compute = (spec, extras, scope) => {
    const { own, files, toml } = project(spec, extras), ms = {};
    let t = performance.now(), checked;
    for (let attempt = 0; ; attempt++) {
      if (!locks.has(toml)) {
        const locked = call("run", ["--project", "/lexlean.toml", "--diagnostic-format", "json", "lock"], files);
        if (locked.code !== 0) { checked = locked; break; }
        locks.set(toml, listing(locked.root).get("/lexlean.lock").slice());
        ms.lock = performance.now() - t; t = performance.now();
      }
      files.set("/lexlean.lock", locks.get(toml));
      const selection = scope === "all" ? ["--all"] : own.map((m) => modulePath(m.name));
      checked = call("run", ["--project", "/lexlean.toml", "--diagnostic-format", "json", "check", ...selection], files);
      // A lock LexLean calls stale is made again, once; it is LexLean that decides.
      if (attempt === 0 && /"code":"LLC0102"/.test(checked.stdout)) { locks.delete(toml); continue; }
      break;
    }
    ms.check = performance.now() - t; t = performance.now();
    let result;
    try { result = JSON.parse(checked.stdout); } catch { throw fail("ITC_OUTPUT", `the checker wrote no result (exit ${checked.code}): ${checked.stderr.slice(0, 200)}`); }
    const out = { ok: result.success === true, exit: checked.code, diagnostics: result.diagnostics.map(shape) };
    if (out.ok) {
      out.data = {};
      for (const m of own) {
        const r = call("data", [`/${modulePath(m.name)}`], files);
        const text = r.code === 0 ? r.stdout.match(/\\semanticdata\{([\s\S]*)\}\n\\end\{semanticmodule\}/)?.[1] : null;
        if (!text) throw fail("ITC_DATA", `no data form for ${m.name} (exit ${r.code})`);
        out.data[m.name] = JSON.parse(text);
      }
      ms.data = performance.now() - t;
    }
    return { out, ms };
  };

  return {
    by,
    loadMs: { hash: tHash - t0, compile: tCompile - tHash, instantiate: tOpen - tCompile, version: tVersion - tOpen },
    memoryBytes: () => instance.memoryBytes(),
    // Computes the compiler's identity for language 1.2 ahead of the first check.
    warm() { const t = performance.now(); call("warm", [], new Map()); return performance.now() - t; },
    // The lock LexLean writes for a spec's project, as text.
    lock(spec, { extras = [] } = {}) {
      const { files } = project(spec, extras);
      const locked = call("run", ["--project", "/lexlean.toml", "--diagnostic-format", "json", "lock"], files);
      return new TextDecoder().decode(listing(locked.root).get("/lexlean.lock"));
    },
    // `check --all` on the pack alone: the library and lexicon with no module of an author's.
    library() {
      const files = new Map(base.map(([path, bytes]) => [`/${path}`, bytes]));
      files.set("/lexlean.toml", enc.encode(fixed["lexlean.toml"].replace(/^entrypoints = .*$/m, 'entrypoints = ["src/Foundation/Bytes.lex.tex"]')));
      const locked = call("run", ["--project", "/lexlean.toml", "--diagnostic-format", "json", "lock"], files);
      files.set("/lexlean.lock", listing(locked.root).get("/lexlean.lock").slice());
      return JSON.parse(call("run", ["--project", "/lexlean.toml", "--diagnostic-format", "json", "check", "--all"], files).stdout);
    },
    // The data form of one library module, by LexLean's own reader.
    libraryData(name) {
      const r = call("data", [`/${modulePath(name)}`], new Map(base.map(([path, bytes]) => [`/${path}`, bytes])));
      if (r.code !== 0) throw fail("ITC_DATA", `no data form for ${name} (exit ${r.code})`);
      return JSON.parse(r.stdout.match(/\\semanticdata\{([\s\S]*)\}\n\\end\{semanticmodule\}/)[1]);
    },
    // Returns { ok, diagnostics, data?, by, cached, ms }. A result is reused only under the address of everything that
    // produced it: the checker, the pack and every module's text. A stored result that does not hash to what was
    // recorded with it is dropped and the check is run.
    async check(spec, { extras = [], scope = "author" } = {}) {
      if (scope !== "author" && scope !== "all") throw fail("ITC_SCOPE", `unknown scope ${scope}`);
      const started = performance.now();
      const key = await derive("foundry/in-tab-check/result/1", [wasmAddress, packAddress, scope, spec, ...extras]);
      const keyed = performance.now();
      let text = memo.get(key), cached = text ? "memory" : false;
      if (!text && store) {
        const kept = await store.get(key);
        if (kept) {
          try {
            const entry = JSON.parse(kept);
            if (entry.key === key && (await address(entry.value)) === entry.value_address) { text = entry.value; cached = "store"; }
          } catch { /* a damaged entry is the same as none */ }
        }
      }
      let ms = {};
      if (!text) {
        const fresh = compute(spec, extras, scope);
        ms = fresh.ms;
        text = JSON.stringify(fresh.out);
        if (store) await store.put(key, JSON.stringify({ key, value: text, value_address: await address(text) }));
      }
      memo.set(key, text);
      return { ...JSON.parse(text), by, cached, key, ms: { ...ms, key: keyed - started, total: performance.now() - started } };
    },
  };
}
