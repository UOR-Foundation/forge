// The proving worker. It receives bytes from the page and reaches no network itself (served with
// `Content-Security-Policy: connect-src 'none'`). One message runs one bench pass; a fresh worker is a fresh tab.
import { Session } from "./tab.mjs";

const now = () => performance.now();
self.onmessage = async ({ data }) => {
  try {
    const out = { timings: {} };
    const t0 = now();
    const s = await Session.open({ manifest: data.manifest, wasm: data.wasm, library: data.library });
    out.timings.ready = now() - t0;
    out.timings.readyParts = s.timing;
    const projects = {};
    for (const [name, p] of Object.entries(data.projects)) {
      const rec = p.records[0];
      let t = now();
      const a = await s.admitSuffix(rec, p.suffix);
      if (a.refusal) throw new Error(a.refusal);
      const admitMs = now() - t;
      const theorems = p.records.map((r) => r.theorem);
      // The first check of a bundle also indexes its terms; later checks reuse the index.
      t = now(); s.judge(p.spec, theorems, rec.bundle); const firstMs = now() - t;
      t = now(); const again = s.judge(p.spec, theorems, rec.bundle); const againMs = now() - t;
      projects[name] = { admitMs, firstMs, againMs, kernelMs: again.kernelMs, assembleMs: again.assembleMs, memoryBytes: again.memoryBytes, checked: again.checked,
        verdicts: again.rows.map((r) => `${r.theorem.split(".").pop()}:${r.verdict}`) };
    }
    out.projects = projects;
    const g = data.projects.guests, rec = g.records.find((r) => r.theorem.endsWith("startsEmpty"));
    const edits = {};
    for (const [tag, app] of Object.entries(data.edits)) {
      const spec = { ...g.spec, modules: { ...g.spec.modules, App: app } };
      const t = now();
      const key = await s.key(spec, rec.theorem);
      const j = s.judge(spec, [rec.theorem], rec.bundle);
      edits[tag] = { ms: now() - t, kernelMs: j.kernelMs, keyChanged: key !== rec.key, verdict: j.rows[0].verdict };
    }
    out.edits = edits;
    // An edit outside a theorem's closure keeps its key: the stored verdict is reused after the key is recomputed.
    {
      const t = now();
      s.remember(await s.key(g.spec, rec.theorem), rec.bundle, ["kernel-checked"]);
      const t1 = now();
      const hit = s.recall(await s.key(g.spec, rec.theorem), rec.bundle);
      out.cached = { ms: now() - t1, hit: !!hit, rememberMs: t1 - t };
    }
    out.heapBytes = performance.memory?.usedJSHeapSize ?? null;
    out.crossOriginIsolated = self.crossOriginIsolated;
    out.sharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
    try { await fetch("/v2/serverless-prove/dist/manifest.json"); out.network = "reachable"; } catch { out.network = "refused"; }
    self.postMessage({ ok: true, ...out });
  } catch (e) {
    self.postMessage({ ok: false, error: String((e && e.stack) || e) });
  }
};
