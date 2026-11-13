// The checker's worker. It is handed bytes and answers checks; it fetches nothing. The page that starts it serves this
// file with a policy that forbids every connection, and the WebAssembly module imports no call that could make one.
import { load } from "./checker.mjs";

let checker = null;
const failure = (e) => ({ error: { code: e.code ?? "ITC_INTERNAL", message: e.message } });

self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === "load") {
      checker = await load({ wasm: m.wasm, pack: m.pack, manifest: m.manifest });
      self.postMessage({ id: m.id, by: checker.by, loadMs: checker.loadMs });
    } else if (!checker) {
      self.postMessage({ id: m.id, ...failure(Object.assign(new Error("the checker is not loaded"), { code: "ITC_NOT_LOADED" })) });
    } else if (m.type === "warm") {
      self.postMessage({ id: m.id, ms: checker.warm(), memoryBytes: checker.memoryBytes() });
    } else if (m.type === "check") {
      const result = await checker.check(m.spec, { extras: m.extras ?? [] });
      self.postMessage({ id: m.id, result, memoryBytes: checker.memoryBytes() });
    } else if (m.type === "probe") {
      // Evidence for the report: what this worker can reach.
      let network;
      try { await fetch(m.url); network = "reached"; } catch (e) { network = `refused: ${e.message}`; }
      self.postMessage({ id: m.id, network, isolated: self.crossOriginIsolated });
    }
  } catch (e) { self.postMessage({ id: m.id, ...failure(e) }); }
};
