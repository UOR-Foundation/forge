// FoundrySpecification.compositionHostBoundary. Classic script shared by page
// and worker. tools/kernel.mjs binds this guest and metadata to KERNEL_REV.
(function (scope) {
  "use strict";
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const fail = code => Object.assign(new Error(`Kernel refused: ${code}`), { code });
  const toHex = buffer => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength").get;
  const bounded = (value, maximum) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
  const fromBase64 = text => {
    if (typeof text !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw fail("invalidKernelMetadata");
    try { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
    catch { throw fail("invalidKernelMetadata"); }
  };
  function metadata(meta) {
    if (meta?.spec !== "hologram-forge/kernel/1" || typeof meta.digest !== "string" || !/^blake3:[0-9a-f]{64}$/.test(meta.digest || "") || meta.guest?.path !== "kernel/guest.wasm" || typeof meta.guest.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(meta.guest.sha256 || "") || !bounded(meta.guest.bytes, 16 * 1024 * 1024)) throw fail("invalidKernelMetadata");
    const limits = meta.limits;
    if (!limits || ![limits.request, limits.response, limits.guestAllocation].every(n => bounded(n, 1024 * 1024)) || limits.request > limits.guestAllocation || !Array.isArray(meta.vectors) || !bounded(meta.vectors.length, 4096)) throw fail("invalidKernelMetadata");
    let total = 0;
    const vectors = meta.vectors.map(row => {
      if (!Array.isArray(row) || row.length !== 2 || row.some(text => typeof text !== "string" || text.length > 1400000)) throw fail("invalidKernelMetadata");
      const request = fromBase64(row[0]), response = fromBase64(row[1]);
      total += request.length + response.length;
      if (request.length > limits.guestAllocation || response.length > limits.response || total > 64 * 1024 * 1024) throw fail("invalidKernelMetadata");
      return [request, response];
    });
    return { vectors, limits: { ...limits } };
  }
  async function run(module, request, maximum) {
    let result;
    try {
      const instance = await WebAssembly.instantiate(module, {});
      const { memory, holo_alloc, holo_run } = instance.exports;
      const at = holo_alloc(request.length);
      new Uint8Array(memory.buffer, at, request.length).set(request);
      const packed = BigInt.asUintN(64, BigInt(holo_run(at, request.length)));
      const length = Number(packed & 0xffffffffn);
      if (length > maximum) throw fail("kernelResponseTooLarge");
      result = new Uint8Array(memory.buffer, Number(packed >> 32n), length).slice();
    } catch (error) {
      if (error?.code === "kernelResponseTooLarge") throw error;
      throw fail("kernelExecutionFailed");
    }
    return result;
  }
  // A small number of instances in a worker bounds V8's virtual Wasm reservations.
  // Terminating the worker releases its isolate; every run still instantiates the exact module afresh.
  function browserExecutor(module) {
    let worker = null, workerURL = null, uses = 0, pending = 0, queuedBytes = 0, sequence = 0, tail = Promise.resolve();
    const retire = () => { if (worker) worker.terminate(); if (workerURL) URL.revokeObjectURL(workerURL); worker = null; workerURL = null; uses = 0; };
    const workerMain = function () {
      let module;
      self.onmessage = async ({ data }) => {
        try {
          if (data.module) module = data.module;
          const result = await run(module, data.request, data.maximum);
          self.postMessage({ id: data.id, ok: true, result }, [result.buffer]);
        } catch (error) { self.postMessage({ id: data.id, ok: false, code: error?.code === "kernelResponseTooLarge" ? error.code : "kernelExecutionFailed" }); }
      };
    };
    const execute = (request, maximum) => {
      if (pending >= 64 || queuedBytes + request.length > 64 * 1024 * 1024) return Promise.reject(fail("kernelExecutionFailed"));
      pending++; queuedBytes += request.length;
      const next = tail.then(() => new Promise((resolve, reject) => {
        let timer;
        const refuse = code => { clearTimeout(timer); retire(); reject(fail(code)); };
        try {
          if (uses >= 16) retire();
          if (!worker) {
            workerURL = URL.createObjectURL(new Blob([`const fail = ${fail.toString()}; const run = ${run.toString()}; (${workerMain.toString()})();`], { type: "text/javascript" }));
            worker = new Worker(workerURL);
          }
          const active = worker, id = ++sequence, first = uses++ === 0;
          timer = setTimeout(() => refuse("kernelExecutionFailed"), 30000);
          active.onerror = event => { event.preventDefault?.(); refuse("kernelExecutionFailed"); };
          active.onmessage = ({ data }) => {
            if (!data || data.id !== id || typeof data.ok !== "boolean") { refuse("kernelExecutionFailed"); return; }
            clearTimeout(timer);
            if (!data.ok) { refuse(data.code === "kernelResponseTooLarge" ? data.code : "kernelExecutionFailed"); return; }
            if (!(data.result instanceof Uint8Array) || data.result.length > maximum) { refuse(data.result?.length > maximum ? "kernelResponseTooLarge" : "kernelExecutionFailed"); return; }
            resolve(data.result.slice());
          };
          active.postMessage({ id, ...(first ? { module } : {}), request, maximum });
        } catch { refuse("kernelExecutionFailed"); }
      })).finally(() => { pending--; queuedBytes -= request.length; });
      tail = next.catch(() => {});
      return next;
    };
    return { execute, retire };
  }
  async function load(get) {
    let meta, bytes;
    try {
      const response = await get("kernel/kernel.json");
      if (!response.ok) throw Error();
      meta = await response.json();
    } catch { throw fail("kernelLoadFailed"); }
    const { vectors, limits } = metadata(meta);
    try {
      const response = await get(meta.guest.path);
      if (!response.ok) throw Error();
      bytes = await response.arrayBuffer();
    } catch { throw fail("kernelLoadFailed"); }
    let digest;
    try { digest = toHex(await crypto.subtle.digest("SHA-256", bytes)); }
    catch { throw fail("kernelLoadFailed"); }
    if (bytes.byteLength !== meta.guest.bytes || digest !== meta.guest.sha256) throw fail("kernelIntegrityMismatch");
    let module;
    try { module = await WebAssembly.compile(bytes); }
    catch { throw fail("kernelLoadFailed"); }
    const names = WebAssembly.Module.exports(module).map(e => e.name).sort().join(",");
    if (WebAssembly.Module.imports(module).length || names !== "holo_alloc,holo_run,memory") throw fail("kernelExportsMismatch");
    // Headless Node diagnostics have no browser location. Browsers must use a worker.
    if (typeof location !== "undefined" && typeof Worker !== "function") throw fail("kernelExecutionFailed");
    const executor = typeof Worker === "function" ? browserExecutor(module) : { execute: (request, maximum) => run(module, request, maximum), retire() {} };
    try { for (const [request, response] of vectors) {
      try { if (!same(await executor.execute(request, limits.response), response)) throw Error(); }
      catch { throw fail("kernelAcceptanceFailed"); }
    }
    } finally { executor.retire(); }
    const dispatch = async request => {
      if (!(request instanceof Uint8Array)) throw fail("invalidKernelRequest");
      let length, copy;
      try { length = byteLength.call(request); }
      catch { throw fail("invalidKernelRequest"); }
      if (length > limits.request) throw fail("kernelRequestTooLarge");
      try { copy = new Uint8Array(length); Uint8Array.prototype.set.call(copy, request); }
      catch { throw fail("invalidKernelRequest"); }
      return executor.execute(copy, limits.response);
    };
    return Object.freeze({
      digest: meta.digest, vectors: vectors.length, dispatch,
      ask: async line => {
        if (typeof line !== "string") throw fail("invalidKernelRequest");
        return decoder.decode(await dispatch(encoder.encode(line)));
      },
    });
  }
  scope.ForgeKernel = Object.freeze({ load });
})(self);
