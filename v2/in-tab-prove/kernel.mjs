// The host of the in-tab kernel check: runs dist/kernel-tab.wasm (nanoda_lib, unmodified, behind crate/) over an
// export in lean4export's form. It holds no typing rule. It answers the eleven WASI calls the module imports: the
// export is standard input, output is collected, there is no file, clock or network, and randomness is a fixed
// sequence so a result is a function of the checker's bytes, the export's bytes and the options.
//
// The verdict's name is "kernel-checked", never "proved": see REPORT.md for what stands between the two.

const ALLOWED = new Set([
  "random_get", "environ_get", "environ_sizes_get", "fd_close", "fd_fdstat_get", "fd_prestat_get",
  "fd_prestat_dir_name", "fd_read", "fd_write", "path_open", "proc_exit",
]);
const EBADF = 8, ENOSYS = 52;

export class KernelError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return "sha256:" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compile once. `address`, when given, is what the manifest names; other bytes are refused before compiling.
export async function load(wasmBytes, address) {
  const actual = await sha256(wasmBytes);
  if (address !== undefined && actual !== address) throw new KernelError("ITP_ADDRESS", `checker is ${actual}, the manifest names ${address}`);
  const module = await WebAssembly.compile(wasmBytes);
  for (const entry of WebAssembly.Module.imports(module)) {
    if (entry.module !== "wasi_snapshot_preview1" || !ALLOWED.has(entry.name)) {
      throw new KernelError("ITP_IMPORT", `the checker imports ${entry.module}.${entry.name}`);
    }
  }
  return { module, address: actual };
}

// One check, one instance: a refusal is a trap, and a trapped instance is never used again.
export function check(checker, exportBytes, options = {}) {
  let cursor = 0;
  const output = [];
  let memory;
  const view = () => new DataView(memory.buffer);
  const wasi = {
    random_get(pointer, length) { new Uint8Array(memory.buffer, pointer, length).fill(0x5a); return 0; },
    environ_sizes_get(count, size) { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
    environ_get() { return 0; },
    fd_close() { return 0; },
    fd_fdstat_get(fd, pointer) {
      if (fd > 2) return EBADF;
      new Uint8Array(memory.buffer, pointer, 24).fill(0);
      view().setUint8(pointer, 2); // a character device
      return 0;
    },
    fd_prestat_get() { return EBADF; }, // no directory is open: the module has no file system
    fd_prestat_dir_name() { return EBADF; },
    path_open() { return ENOSYS; },
    fd_read(fd, iovs, count, read) {
      if (fd !== 0) return EBADF;
      let total = 0;
      for (let i = 0; i < count; i += 1) {
        const pointer = view().getUint32(iovs + 8 * i, true);
        const length = view().getUint32(iovs + 8 * i + 4, true);
        const take = Math.min(length, exportBytes.length - cursor);
        new Uint8Array(memory.buffer, pointer, take).set(exportBytes.subarray(cursor, cursor + take));
        cursor += take; total += take;
        if (take < length) break;
      }
      view().setUint32(read, total, true);
      return 0;
    },
    fd_write(fd, iovs, count, written) {
      let total = 0;
      for (let i = 0; i < count; i += 1) {
        const pointer = view().getUint32(iovs + 8 * i, true);
        const length = view().getUint32(iovs + 8 * i + 4, true);
        if (output.length < 64) output.push(new TextDecoder().decode(new Uint8Array(memory.buffer, pointer, length).slice()));
        total += length;
      }
      view().setUint32(written, total, true);
      return 0;
    },
    proc_exit(code) { throw new KernelError("ITP_EXIT", `the checker exited ${code}`); },
  };
  const instance = new WebAssembly.Instance(checker.module, { wasi_snapshot_preview1: wasi });
  memory = instance.exports.memory;
  const text = new TextEncoder().encode(JSON.stringify(options));
  const pointer = instance.exports.alloc(text.length);
  new Uint8Array(memory.buffer, pointer, text.length).set(text);

  const read = () => {
    const length = instance.exports.result_len();
    if (length === 0) return null;
    return JSON.parse(new TextDecoder().decode(new Uint8Array(memory.buffer, instance.exports.result_ptr(), length).slice()));
  };
  let result;
  try {
    instance.exports.check(pointer, text.length);
    result = read();
  } catch (trap) {
    // nanoda refuses by panicking; the panic hook left its message. A trap with no message (stack or memory
    // exhausted) is a refusal too, named as what it is: nothing was accepted.
    let left = null;
    try { left = read(); } catch { /* the memory may be gone */ }
    result = left && left.ok === false ? left : { ok: false, stage: "trap", refusal: String(trap && trap.message || trap) };
  }
  if (result === null) result = { ok: false, stage: "trap", refusal: "the checker returned nothing" };
  result.memory_bytes = memory.buffer.byteLength;
  result.read_bytes = cursor;
  if (output.length) result.output = output.join("").slice(0, 2000);
  // Everything exported must have been read: an export the parser stopped short of was not checked as a whole.
  if (result.ok && cursor !== exportBytes.length) result = { ok: false, stage: "input", refusal: `read ${cursor} of ${exportBytes.length} bytes` };
  return result;
}

// The judgement on one theorem, from an export of that theorem and everything it depends on. Three conditions, the
// last two of them the host's because the checker judges declarations, not intentions:
//   1. every declaration of the export is accepted, with only the declared axioms available;
//   2. the theorem asked about is among the declarations that were checked (an export that leaves it out, or a
//      caller that admits it unchecked, proves nothing about it);
//   3. the axioms the export declares are exactly the declared ones. The export is the theorem's dependency closure,
//      so these are the axioms `#print axioms` reports, and LexLean's policy is equality, not inclusion.
// What this cannot see: that the theorem's statement in the export is the statement the spec wrote. Only the
// elaborator that made the export knows that.
export function judge(checker, exportBytes, { theorem, axioms }) {
  const result = check(checker, exportBytes, { permitted_axioms: axioms });
  if (!result.ok) return { verdict: "refused", why: `${result.stage}: ${result.refusal}`, result };
  if (!result.theorems.includes(theorem)) return { verdict: "refused", why: `the export does not check ${theorem}`, result };
  const seen = [...result.axioms_in_environment].sort(), declared = [...axioms].sort();
  if (result.axioms_left_out.length || JSON.stringify(seen) !== JSON.stringify(declared)) {
    return { verdict: "refused", why: `axioms [${[...seen, ...result.axioms_left_out].join(", ")}], declared [${declared.join(", ")}]`, result };
  }
  return { verdict: "kernel-checked", theorem, axioms: seen, declarations: result.checked, result };
}
