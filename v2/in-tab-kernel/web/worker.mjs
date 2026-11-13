// The kernel worker. It holds one instance of Lean's kernel with the pinned library resident, and judges suffixes.
// It reaches no network (served with `Content-Security-Policy: connect-src 'none'`): the page hands it bytes, and it
// re-derives every address itself before the kernel sees a byte (InTabKernel.kernelRunsOnlyOnAddressedBytes).
//
//   { op: "open", manifest, glue, wasm, library }   -> { ok, timings, heapMB } | { ok: false, refusal }
//   { op: "check", id, suffix, sha256 }             -> { id, accepted, exit, ms, output } | { id, refusal }
//   { op: "whole", id, bytes }                      -> the same, every declaration judged, in a fresh instance
const now = () => performance.now();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));

let factory = null, wasmBinary = null, resident = null;
const lines = [];

async function instance() {
  // The loader would fetch the module from beside itself. It is given the bytes whose address was checked instead.
  const m = await factory({ instantiateWasm: (imports, done) => { WebAssembly.instantiate(wasmBinary, imports).then((r) => done(r.instance, r.module)); return {}; }, locateFile: (p) => p, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
  if (m.ccall("checker_ready", "number", [], []) !== 0) throw new Error("the kernel did not initialize: " + lines.join(" "));
  return m;
}
function run(m, entry, bytes) {
  lines.length = 0;
  m.FS.writeFile("/in.ndjson", bytes);
  const t0 = now();
  let exit;
  try { exit = m.ccall(entry, "number", ["string"], ["/in.ndjson"]); }
  catch (e) { exit = 3; lines.push("trap: " + (e && e.message ? e.message : String(e))); }
  const ms = now() - t0;
  m.FS.unlink("/in.ndjson");
  return { accepted: exit === 0, exit, ms, output: lines.join("\n").slice(-400) };
}

async function open({ manifest, glue, wasm, library }) {
  const timings = {};
  let t = now();
  // Address binding: all three are checked before any of them is used.
  const [glueSha, wasmSha, librarySha] = await Promise.all([sha256(glue), sha256(wasm), sha256(library)]);
  timings.hashMs = now() - t;
  if (glueSha !== manifest.glue.sha256) return { ok: false, refusal: "the kernel's loader is not the pinned one" };
  if (wasmSha !== manifest.wasm.sha256) return { ok: false, refusal: "the kernel is not the pinned one" };
  if (librarySha !== manifest.library.sha256) return { ok: false, refusal: "the library is not the pinned one" };
  t = now();
  const url = URL.createObjectURL(new Blob([glue], { type: "text/javascript" }));
  try { factory = (await import(url)).default; } finally { URL.revokeObjectURL(url); }
  wasmBinary = wasm;
  const m = await instance();
  timings.readyMs = now() - t;
  const load = run(m, "load_library", new Uint8Array(library));
  timings.libraryMs = load.ms;
  if (!load.accepted) return { ok: false, refusal: "the kernel refused the pinned library: " + load.output };
  resident = m;
  return { ok: true, timings, heapMB: Math.round(m.HEAPU8.length / 1048576), kernel: wasmSha, library: librarySha };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.op === "open") return self.postMessage({ op: "open", ...(await open(data)) });
    if (data.op === "check") {
      if (!resident) return self.postMessage({ id: data.id, refusal: "no library is resident" });
      const bytes = new Uint8Array(data.suffix);
      if ((await sha256(bytes)) !== data.sha256) return self.postMessage({ id: data.id, refusal: "the bundle is not the one named" });
      return self.postMessage({ id: data.id, ...run(resident, "check_suffix", bytes), heapMB: Math.round(resident.HEAPU8.length / 1048576) });
    }
    if (data.op === "whole") {
      const m = await instance();
      return self.postMessage({ id: data.id, ...run(m, "check_whole", new Uint8Array(data.bytes)), heapMB: Math.round(m.HEAPU8.length / 1048576) });
    }
  } catch (e) {
    self.postMessage({ id: data.id, op: data.op, ok: false, refusal: "the worker failed: " + (e && e.message ? e.message : String(e)) });
  }
};
