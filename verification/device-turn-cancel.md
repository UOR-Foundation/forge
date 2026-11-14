# Stopping a device turn

Before this change, Stop on a turn answered by the on-device model only hid the streamed text. The engine (`q/core/engine.js`) checks an `AbortSignal` at every step, but `host.js` never passed one. So a stopped rules turn kept the single engine lock until it reached its token cap (up to 900 tokens). Every later device turn waited behind it. The finished answer was then shown and kept as the conversation, and its receipt was sealed.

`deviceGenerate` in `host.js` now does three things:

- It passes the turn's own signal to the engine, so the engine stops at its next step and releases the lock.
- It refuses to start a turn that was stopped while waiting for the lock.
- It throws `generationCancelled` after the engine returns, before the answer is shown, remembered or sealed.

The turn then ends as a cancelled turn, exactly as a paid one does: the existing handler records "Response cancelled by user" and no error.

Not changed: the service-worker endpoint (`serve` in `inference.js`) has no cancel signal from its client. A local model's own load (`rulesModel()`) still runs to completion, so the next turn finds the model resident.

## Tests

`studio/tools/device_turn_cancel.test.mjs` runs the actual `deviceGenerate` from `host.js` and the actual `withEngine` lock from `inference.js` in a VM against a fake engine that steps the way the snapshot's `generate` does. It has four tests:

- An unstopped turn streams every token and passes the turn's signal to the engine.
- A stop mid-turn ends at the engine's next step, shows nothing after it, rejects as `generationCancelled`, and frees the lock for the next turn.
- A turn stopped while waiting for the lock never calls the engine.
- A source check: the device branch calls `deviceGenerate` with `abort.signal`, before `rememberSession` and `buildReceipt`, and `host.js` has no other direct `inst.generate(` call.

## Planted defects

All rows ran `node --test tools/device_turn_cancel.test.mjs`.

| Defect | Result |
| --- | --- |
| The signal is not passed to the engine | rejected: tests 1 and 2 fail |
| No stop check after the engine returns | rejected: test 2 fails |
| No stop check before the engine starts | rejected: test 3 fails |
| The device branch calls `inst.generate` directly again | rejected: test 4 fails |
| none | 4 pass |

## Not covered

The real engine is not run here; it needs WebGPU. The claim that the snapshot engine stops at its next step is read from `q/core/engine.js`: its three decode paths each check `signal.aborted` per step or per callback. It is not measured.
