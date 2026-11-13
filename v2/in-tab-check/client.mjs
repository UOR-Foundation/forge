// The page's side: get the checker's bytes by address, hand them to the worker, and answer `check(spec)` in the tab
// when the worker is ready and through the hosted service when it is not. Every answer says which one gave it.
const fail = (code, message) => Object.assign(new Error(message), { code });

// bytesOf(name, address) returns an ArrayBuffer for a manifest entry; the worker refuses bytes that do not match.
// hosted(spec, options) is the hosted route (v2/hosted-check/check.mjs), or null for none.
// makeWorker() returns a Worker-like object (postMessage, onmessage, onerror).
export function createClient({ makeWorker, manifest, bytesOf, hosted = null, onState = () => {} }) {
  let worker = null, ready = null, state = "idle", next = 0;
  const waiting = new Map();
  const set = (s, detail) => { state = s; onState(s, detail); };
  const ask = (message, transfer = []) => new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, ...message }, transfer);
  });
  const start = () => {
    if (ready) return ready;
    set("loading");
    ready = (async () => {
      const [wasm, pack] = await Promise.all([bytesOf("checker", manifest.checker), bytesOf("pack", manifest.pack)]);
      worker = makeWorker();
      worker.onmessage = ({ data }) => {
        const w = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.error) w?.reject(fail(data.error.code, data.error.message)); else w?.resolve(data);
      };
      worker.onerror = (e) => { for (const w of waiting.values()) w.reject(fail("ITC_WORKER", e.message ?? "the worker failed")); waiting.clear(); };
      const loaded = await ask({ type: "load", wasm, pack, manifest }, [wasm, pack]);
      const warmed = await ask({ type: "warm" });
      set("ready", { by: loaded.by, loadMs: loaded.loadMs, warmMs: warmed.ms });
      return loaded;
    })().catch((e) => { set("unavailable", { code: e.code ?? "ITC_LOAD", message: e.message }); throw e; });
    return ready;
  };
  return {
    start,
    ask: (message) => ask(message),
    state: () => state,
    // In the tab when it is ready. Otherwise the hosted service answers this one while the tab's checker loads,
    // unless `only: "in-tab"` asks to wait for it. Nothing moves to the hosted route silently: such an answer names
    // that route and why the tab did not give it.
    async check(spec, { extras = [], only = null } = {}) {
      let why;
      if (state === "ready" || only === "in-tab") {
        try {
          await start();
          return (await ask({ type: "check", spec, extras })).result;
        } catch (e) {
          if (only === "in-tab" || !hosted) throw e;
          why = { code: e.code ?? "ITC_INTERNAL", message: e.message };
        }
      } else {
        start().catch(() => {});
        why = { code: state === "unavailable" ? "ITC_UNAVAILABLE" : "ITC_NOT_LOADED", message: `the checker in this tab is ${state}` };
      }
      if (!hosted) throw fail(why.code, why.message);
      const r = await hosted(spec, { extras });
      return { ...r, by: { route: "hosted", instead: why }, cached: false };
    },
  };
}
