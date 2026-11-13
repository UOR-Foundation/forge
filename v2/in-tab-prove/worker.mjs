// The worker of the in-tab kernel check. It is handed bytes and returns JSON; it fetches nothing and holds no key.
import { load, check, sha256 } from "./kernel.mjs";

let checker;

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  try {
    if (op === "load") {
      const t0 = performance.now();
      checker = await load(new Uint8Array(data.wasm), data.address);
      // The first instance pays for the engine's lazy compilation; make it now, on an export of nothing.
      const warm = check(checker, new Uint8Array(0), {});
      self.postMessage({ id, ok: true, address: checker.address, ms: performance.now() - t0, warm: warm.refusal });
    } else if (op === "check") {
      const bytes = new Uint8Array(data.export);
      const t0 = performance.now();
      const address = data.address === undefined ? undefined : await sha256(bytes);
      const hashed = performance.now();
      if (address !== data.address) {
        self.postMessage({ id, ok: true, result: { ok: false, stage: "address", refusal: `export is ${address}, expected ${data.address}` } });
        return;
      }
      const options = { ...data.options };
      if (data.library) {
        // The library is admitted only as bytes: the export must begin with exactly the bytes whose address a full
        // check accepted. Then that many declarations are entered without being checked again.
        const prefix = await sha256(bytes.subarray(0, data.library.bytes));
        if (prefix !== data.library.address) {
          self.postMessage({ id, ok: true, result: { ok: false, stage: "address", refusal: `the export does not begin with the library ${data.library.address}` } });
          return;
        }
        options.admitted = data.library.declarations;
      }
      const result = check(checker, bytes, options);
      const done = performance.now();
      self.postMessage({ id, ok: true, result, hash_ms: hashed - t0, check_ms: done - hashed, by: { checker: checker.address, export: address } });
    } else if (op === "probe") {
      // What the worker can reach: asked by the bench page, to state it from a measurement.
      const tries = {};
      for (const url of data.urls) {
        try { await fetch(url); tries[url] = "reached"; } catch (error) { tries[url] = "refused: " + error.name; }
      }
      self.postMessage({ id, ok: true, tries, isolated: self.crossOriginIsolated, shared: typeof SharedArrayBuffer });
    }
  } catch (error) {
    self.postMessage({ id, ok: false, code: error.code ?? "ITP_WORKER", message: String(error.message ?? error) });
  }
};
