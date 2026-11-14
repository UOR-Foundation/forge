# On-device engine seam

`studio/shell/device-engine.mjs` is the only shell file that imports the engine under `studio/shell/q/`. Before this change `inference.js` imported four of its modules and its wasm package directly (`q/core/loader.js`, `engine.js`, `q-brain-fast.mjs`, `kappa.js`, `q/pkg/holospaces_web.js`), so replacing the engine meant editing the inference adapter in five places.

The seam takes a list of adapters. A model loads through the first adapter whose `runs(entry)` answers true; the snapshot engine is last and runs every catalogue entry, so it is the fallback. The catalogue, BLAKE3 addresses and receipt verification stay the snapshot's, so seals written before a model moves to another engine still verify. Today the list holds only the snapshot adapter, so behaviour is unchanged.

What stays in `inference.js`: the single-engine lock (`withEngine`), the seed-then-large ladder and its `promote` rule, warm KV across turns, the model ids, and sealing. `host.js` is unchanged; it still calls `generate` and `buildReceipt` on the handle the seam returns, which is the engine's own object.

No capability, diagnostic or model id is added or changed, so nothing is registered in the model.

## Tests

`studio/tools/device_engine.test.mjs`, eleven tests with fake engine modules (the real ones need WebGPU): a model loads and the handle is the engine's own; a load answered without a GPU is refused and nothing is built; an unknown family is refused by name; framing before a load is refused; routing to the first adapter that runs a model, with the snapshot as fallback and still owning hashing and receipts; the wasm is initialised once and a failed import is retried; receipt verification is delegated; an empty adapter list is refused; and a source check that no other shell file names a module under `q/`, with its own fixture showing it catches `import()`, static `import`, `new URL(...)` and an HTML `src`, and ignores a comment.

## Planted defects

| Defect | Command | Result |
| --- | --- | --- |
| `inference.js` imports `q/core/kappa.js` directly again | `node --test tools/device_engine.test.mjs` | rejected: `not ok 10 - device-engine.mjs is the only shell file that names the engine under q/` |
| Every model goes to the first adapter (no fallback) | the same | rejected: `not ok 5 - a model goes to the first adapter that runs it; every other model falls back to the snapshot` |
| A load without a GPU is accepted | the same | rejected: `not ok 2 - a load the engine answers without a GPU is refused, and nothing is built` |
| none | the same | 11 pass |

## Not covered

The real engine is not run by these tests; it needs WebGPU. The browser lanes and `perf_budget.mjs --browser` exercise the shell as before. The page gains one 3,893-byte module (1,623 bytes gzipped), in the shell closure beside `inference.js`.
