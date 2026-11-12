// What the tab's checker is made of, in a browser: where its manifest, its bytes and its worker come from, and
// where its results are kept between visits. Loaded after the page is useful; app.mjs holds the routing.
//
// Nothing here runs before the service worker controls the page. Three things rest on it (sw.template.js):
// the manifest and the worker's scripts are answered only with the bytes this shell's closure lists, and the
// worker's script carries a policy that allows no connection, which a static host cannot send. A page with no
// service worker gets no checker of its own, says why, and the hosted service checks instead.
const fail = (code, message) => Object.assign(new Error(message), { code });
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
const addressOf = async (bytes) => "sha256:" + hex(await crypto.subtle.digest("SHA-256", bytes));

const CACHE = "lexlean-checker";
const KEPT = 64;                 // results kept between visits; the oldest goes first
const CONTROL_MS = 30000;

async function controlled() {
  const sw = navigator.serviceWorker;
  if (!sw) throw fail("ITC_POLICY", "this browser gives the page no service worker, so the worker's no-connection policy cannot be set");
  if (sw.controller) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(fail("ITC_POLICY", "no service worker controls this page, so the worker's no-connection policy cannot be set (a forced reload does this; reload normally)")), CONTROL_MS);
    sw.addEventListener("controllerchange", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/**
 * `base` is the shell's base path. `get`, `put` and `del` are the host's own store functions (store, key[, value]);
 * results are kept in "objects" under "check:<address of everything that produced the result>".
 */
export async function parts({ base, get, put, del }) {
  await controlled();
  const root = new URL(base, location.href);
  const here = (path) => new URL("live/v2/in-tab/" + path, root);
  const fetched = async (url, code) => {
    let r;
    try { r = await fetch(url); } catch (e) { throw fail(code, `${url.pathname} could not be fetched: ${e.message}`); }
    if (!r.ok) throw fail(code, `${url.pathname} answered ${r.status}`);
    return r;
  };
  const manifest = await (await fetched(here("checker-lean.json"), "ITC_MANIFEST")).json();
  // The checker's bytes are named by their address, fetched once and kept under that name. Bytes that are not the
  // address are never kept and never handed on; the worker checks them again before it compiles them.
  const bytesOf = async (name, address) => {
    if (name === "pack") return (await fetched(here("pack.json"), "ITC_FETCH")).arrayBuffer();
    const url = new URL("checker/" + address.replace(":", "-") + ".wasm", root);
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) {
      const bytes = await hit.arrayBuffer();
      if ((await addressOf(bytes)) === address) return bytes;
      await cache.delete(url);
    }
    const bytes = await (await fetched(url, "ITC_FETCH")).arrayBuffer();
    const got = await addressOf(bytes);
    if (got !== address) throw fail("ITC_ADDRESS", `the checker's bytes are ${got}, not ${address}`);
    await cache.put(url, new Response(bytes.slice(0), { headers: { "content-type": "application/wasm" } }));
    for (const other of await cache.keys()) if (other.url !== url.href) await cache.delete(other);
    return bytes;
  };
  const INDEX = "check:index";
  const store = {
    get: (key) => get("objects", "check:" + key),
    async put(key, value) {
      await put("objects", "check:" + key, value);
      const index = ((await get("objects", INDEX)) || []).filter((k) => k !== key);
      index.push(key);
      for (const old of index.splice(0, Math.max(0, index.length - KEPT))) await del("objects", "check:" + old);
      await put("objects", INDEX, index);
    },
  };
  return { manifest, bytesOf, store, probe: true, makeWorker: () => new Worker(here("worker.mjs"), { type: "module", name: "lexlean-check" }) };
}
