// The page's side: get the checker's bytes by address, hand them to the worker, and answer `check(spec)` in the tab
// when the worker is ready and through the hosted service when it is not. Every answer says which one gave it.
const fail = (code, message) => Object.assign(new Error(message), { code });

// What the tab's checker is made of, given directly or by `parts()`, which may be asynchronous and is called once,
// when the checker is first started:
//   manifest             what may run, by address (checker.json)
//   bytesOf(name, addr)  an ArrayBuffer for a manifest entry; the worker refuses bytes that do not match
//   makeWorker()         a Worker-like object (postMessage, onmessage, onerror)
//   store                optional { get(key), put(key, value) } over strings, for reuse across visits; never trusted
//   probe                when true, the worker must show that it can open no connection before it is handed anything
// hosted(spec, options) is the hosted check (v2/hosted-check/check.mjs) and hostedData(spec) the hosted data form;
// either may be null for none.
export function createClient({ parts = null, makeWorker, manifest, bytesOf, store = null, probe = false, hosted = null, hostedData = null, onState = () => {} }) {
  let worker = null, ready = null, state = "idle", detail = null, next = 0;
  const waiting = new Map();
  const set = (s, d = null) => { state = s; detail = d; onState(s, d); };
  const ask = (message, transfer = []) => new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, ...message }, transfer);
  });
  const start = () => {
    if (ready) return ready;
    set("loading");
    ready = (async () => {
      const p = parts ? await parts() : { makeWorker, manifest, bytesOf, store, probe };
      worker = p.makeWorker();
      worker.onmessage = async ({ data }) => {
        // The worker asks the page to keep or find a result. A store that fails is the same as an empty one.
        if (data.store) {
          let value = null;
          try { value = data.put ? await p.store.put(data.put, data.value) : await p.store.get(data.get); } catch { /* none */ }
          worker.postMessage({ stored: data.store, value: data.put ? null : value ?? null });
          return;
        }
        const w = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.error) w?.reject(fail(data.error.code, data.error.message)); else w?.resolve(data);
      };
      worker.onerror = (e) => {
        const error = fail("ITC_WORKER", e.message ?? "the worker failed");
        for (const w of waiting.values()) w.reject(error);
        waiting.clear();
        if (state === "ready") set("unavailable", { code: error.code, message: error.message });
      };
      try {
        // A worker that can reach a network is handed nothing, and is not used.
        if (p.probe) {
          const said = await ask({ type: "probe" });
          if (said.network === "reached" || !said.policy) throw fail("ITC_POLICY", "the worker's no-connection policy is not in force, so the checker in this tab is not used");
        }
        const [wasm, pack] = await Promise.all([p.bytesOf("checker", p.manifest.checker), p.bytesOf("pack", p.manifest.pack)]);
        const loaded = await ask({ type: "load", wasm, pack, manifest: p.manifest, store: !!p.store }, [wasm, pack]);
        const warmed = await ask({ type: "warm" });
        set("ready", { by: loaded.by, loadMs: loaded.loadMs, warmMs: warmed.ms });
        return loaded;
      } catch (e) { worker.terminate?.(); throw e; }
    })().catch((e) => { set("unavailable", { code: e.code ?? "ITC_LOAD", message: e.message }); throw e; });
    return ready;
  };
  // In the tab when it is ready. Otherwise the hosted service answers this one while the tab's checker loads,
  // unless `only: "in-tab"` asks to wait for it. Nothing moves to the hosted route silently: such an answer names
  // that route and why the tab did not give it.
  const route = async (only, inTab, elsewhere) => {
    let why;
    if (state === "ready" || only === "in-tab") {
      try {
        await start();
        return await inTab();
      } catch (e) {
        if (only === "in-tab" || !elsewhere) throw e;
        why = { code: e.code ?? "ITC_INTERNAL", message: e.message };
      }
    } else {
      start().catch(() => {});
      why = state === "unavailable"
        ? { code: detail?.code ?? "ITC_UNAVAILABLE", message: detail?.message ?? "the checker in this tab is unavailable" }
        : { code: "ITC_NOT_LOADED", message: "the checker in this tab is loading" };
    }
    if (!elsewhere) throw fail(why.code, why.message);
    return { ...(await elsewhere()), by: { route: "hosted", instead: why }, cached: false };
  };
  return {
    start,
    ask: (message) => ask(message),
    // Starts again after a failure. For a failure that can pass (bytes that could not be fetched, memory that could not
    // be had); bytes that are refused will be refused again.
    retry: () => { if (state === "unavailable") ready = null; return start(); },
    state: () => state,
    detail: () => detail,
    // Returns { ok, diagnostics, data?, by, cached, ms }.
    check: (spec, { extras = [], only = null } = {}) => route(only,
      async () => (await ask({ type: "check", spec, extras })).result,
      hosted && (() => hosted(spec, { extras }))),
    // Returns { data, by }: the data form of a module as written, read and not checked.
    data: (spec, { extras = [], only = null } = {}) => route(only,
      async () => ({ data: (await ask({ type: "data", spec, extras })).data, by: detail.by }),
      hostedData && (async () => ({ data: await hostedData(spec) }))),
  };
}
