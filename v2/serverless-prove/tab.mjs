// One proving session in a tab: the pinned checker and library, admitted once by address; bundles admitted by the
// address their record names; the spec bound to each bundle and checked by the kernel. Runs in a worker or in Node.

import { load, check } from "../in-tab-prove/kernel.mjs";
import { parse } from "./export.mjs";
import { assemble, decide, diagnose, VERDICT } from "./bind.mjs";
import { sha256, keyOf, admit, toolchainPreimage } from "./records.mjs";

export const PERMITTED = ["propext", "Quot.sound", "Classical.choice"];
const te = new TextEncoder();

export class Session {
  // manifest: { checker, library } addresses (sha256:...). Bytes that do not hash to them are refused before use.
  static async open({ manifest, wasm, library }) {
    const t0 = performance.now();
    const libraryAddress = await sha256(library);
    if (libraryAddress !== manifest.library) throw new Error(`SP_LIBRARY: the library is ${libraryAddress}, the manifest names ${manifest.library}`);
    const checker = await load(wasm, manifest.checker);
    const t1 = performance.now();
    const lib = parse(library);
    const s = new Session();
    Object.assign(s, { manifest, checker, library, lib, bundles: new Map(), verdicts: new Map() });
    s.toolchain = await sha256(toolchainPreimage({ lean: manifest.lean, library: libraryAddress, checker: manifest.checker, emitter: manifest.emitter }));
    s.timing = { verifyAndCompileMs: t1 - t0, parseLibraryMs: performance.now() - t1 };
    return s;
  }

  // A bundle's own part (what follows the library) is what a prover publishes; the tab joins it to the library.
  async admitSuffix(record, suffix) {
    const t0 = performance.now();
    const refusal = record.bundle === (await sha256(suffix)) ? null : "SP_BUNDLE_ADDRESS";
    if (refusal) return { refusal };
    if (!this.bundles.has(record.bundle)) {
      const bytes = new Uint8Array(this.library.length + suffix.length);
      bytes.set(this.library, 0); bytes.set(suffix, this.library.length);
      this.bundles.set(record.bundle, { bytes, ex: parse(suffix, this.lib) });
    }
    return { refusal: null, ms: performance.now() - t0 };
  }

  key(spec, theorem) { return keyOf(spec, theorem, this.toolchain); }

  // The verdict on some theorems of a spec against one admitted bundle. A refusal is narrowed to the obligations the
  // kernel refuses, one run each, only when asked: that is the reason shown on demand.
  judge(spec, theorems, bundleAddress, { explain = false } = {}) {
    const b = this.bundles.get(bundleAddress);
    const t0 = performance.now();
    const a = assemble({ library: this.library, bundle: b.bytes, spec, theorems, parsed: { lib: this.lib, ex: b.ex } });
    if (!a.ok) return { rows: theorems.map((t) => ({ theorem: t, verdict: VERDICT.refused, why: `${a.code}: ${a.why}` })), ms: performance.now() - t0 };
    const t1 = performance.now();
    const tail = te.encode(a.appended);
    const bytes = new Uint8Array(b.bytes.length + tail.length);
    bytes.set(b.bytes, 0); bytes.set(tail, b.bytes.length);
    const r = check(this.checker, bytes, { admitted: a.admitted, permitted_axioms: PERMITTED });
    const t2 = performance.now();
    const rows = decide(a, r, PERMITTED);
    const failing = explain && !r.ok ? diagnose(a, b.bytes, (x) => check(this.checker, x, { admitted: a.admitted, permitted_axioms: PERMITTED })) : undefined;
    a.release();
    return { rows, failing, assembleMs: t1 - t0, kernelMs: t2 - t1, ms: performance.now() - t0, memoryBytes: r.memory_bytes, checked: r.checked };
  }

  // A verdict stored under the theorem's key and the addresses it was computed from is used only when all match;
  // anything else is recomputed (spec/src/Reuse.lex.tex).
  remember(key, bundle, rows) { this.verdicts.set(key, { key, bundle, rows }); }
  recall(key, bundle) {
    const v = this.verdicts.get(key);
    return v && v.key === key && v.bundle === bundle ? v.rows : null;
  }
}

export { admit, VERDICT };
