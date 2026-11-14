// The one door to the on-device engine. Every other shell file reaches the engine through this module, so
// a second runtime (the Q engine being rebuilt as a Prism app in Hologram-Technologies/prism-hologram-ai)
// can take a model over by adding an adapter here, and the engine under q/ can be removed in one change
// once nothing routes to it. Callers keep the lock, the ladder, the ids and the receipts' storage.
//
// An adapter answers for the models it runs. A loaded model is a handle:
//   tokenize(text) -> ids, bosId, generate(ids, {maxNew, onToken, signal, repPenalty}) -> {text, ids, outIds, stats},
//   buildReceipt({promptText, ctxIds, turnIds, outIds, paramsPatch}) -> sealed receipt.
// The first adapter that runs a model loads it; the snapshot engine runs every model the catalogue lists,
// so it stays last as the fallback.

const ENGINE_BASE = new URL("./q/", import.meta.url);

// The snapshot engine under q/: Hologram Q on WebGPU.
export function snapshotAdapter(importer = (path) => import(new URL(path, ENGINE_BASE).href)) {
  let modules = null, resident = null;
  const load = () => (modules ||= (async () => {
    const [L, E, F] = await Promise.all([importer("core/loader.js"), importer("core/engine.js"), importer("core/q-brain-fast.mjs")]);
    await L.ready();
    return (resident = { L, E, F });
  })().catch((error) => { modules = null; throw error; }));
  let wasm = null;
  const hashing = () => (wasm ||= (async () => {
    const mod = await importer("pkg/holospaces_web.js");
    if (typeof mod.default === "function") { try { await mod.default(); } catch {} }
    return mod;
  })().catch((error) => { wasm = null; throw error; }));
  return {
    name: "hologram-q-snapshot",
    runs: () => true,
    catalogue: async () => (await load()).L.MODELS,
    // Synchronous, because a turn frames its prompt after its model is resident and before it takes the lock.
    frame(entry, messages) {
      if (!resident) throw new Error("the engine frames a prompt only after a model is loaded");
      return resident.F.frameHistory(entry, messages);
    },
    async load(entry, { onStatus, onProgress } = {}) {
      const { L, E } = await load();
      const loaded = await L.loadModel(entry, { onStatus, onProgress });
      if (!loaded || !loaded.gpu) throw new Error("model load failed");
      return E.createEngine(entry, loaded);
    },
    hasher: async () => { const mod = await hashing(); return (bytes) => String(mod.kappa(bytes)); },
    verifyReceipt: async (receipt) => (await importer("core/kappa.js")).verifyIntegrity(receipt),
  };
}

export function createDeviceEngine(adapters = [snapshotAdapter()]) {
  if (!adapters.length) throw new Error("the device engine needs at least one adapter");
  const fallback = adapters[adapters.length - 1];
  const adapterFor = (entry) => adapters.find((a) => a.runs(entry)) || fallback;
  let hasher = null;
  return {
    adapterFor,
    // The models the device offers, from the fallback's catalogue: it is the one that runs them all.
    catalogue: () => fallback.catalogue(),
    async model(fam) {
      const entry = (await fallback.catalogue()).find((m) => m.fam === fam);
      if (!entry) throw new Error(`the device catalogue has no ${fam} model`);
      return entry;
    },
    frame: (entry, messages) => adapterFor(entry).frame(entry, messages),
    load: (entry, progress) => adapterFor(entry).load(entry, progress),
    // Addresses and receipts belong to the snapshot's hashing until another adapter supplies its own,
    // so a seal written by one engine still verifies after a model moves to another.
    hasher: () => (hasher ||= fallback.hasher().catch((e) => { hasher = null; throw e; })),
    async hash(bytes) { return (await this.hasher())(bytes); },
    verifyReceipt: (receipt) => fallback.verifyReceipt(receipt),
  };
}

export const deviceEngine = createDeviceEngine();
