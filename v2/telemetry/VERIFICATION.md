# Verification evidence

| Gate | Command | Result |
| --- | --- | --- |
| Check | `v2/telemetry/sdk.sh` in WSL: `lexlean lock && lexlean check --all` in the image `prismpm.lock` pins | Both modules check (last run in the SDK image before the `maxValue`/`worstOf` rewrite; the current source checks on the hosted service, `data/source.json`) |
| Verify | `node v2/telemetry/tools/verify-loop.mjs` (`lexlean verify --all` in the same image) | Verified, 15 theorems, attestation `d5ea4e3552084571b9531b35ed5e2b7e89ac8092cd72a2efe85a0e56029d6ea8`, of the source before the `maxValue`/`worstOf` rewrite. Not re-run since: WSL could not attach its disk |
| Tests | `node --test v2/telemetry/test.mjs` | 21 of 21 pass |
| Egress gate | `node v2/telemetry/egress-gate.mjs` | 12 files clean |
| Browser | `node v2/telemetry/browser-test.mjs` (headless Chrome, DevTools protocol) | 25 of 25 checks pass |
| Planted defects | `node v2/telemetry/defects.mjs` (output in `out/defects.log`) | 6 of 6 caught, every file restored byte for byte |
| Prometheus | `bash v2/telemetry/tools/prometheus-check.sh` in WSL (`promtool` from `prom/prometheus:v3.5.0`) | Not run: WSL could not attach its disk |

## Planted defects

Each defect is planted in the bytes that run: the model's data form, an adapter, or a new file. The harness restores the file and compares its SHA-256.

| Defect | Caught by | Planted result | Restored |
| --- | --- | --- | --- |
| The store sends each turn with `navigator.sendBeacon` | Egress gate (`sendBeacon`, `navigator network` at `store.mjs` line 13) and the runtime tripwire | tests exit 1, 12 pass, 9 fail; gate exit 1 | 21 pass, gate clean |
| An unlisted file (`beacon.mjs`) joins the telemetry | Egress gate: "neither scanned nor a development file" | tests exit 1, 20 pass, 1 fail | 21 pass, gate clean, file removed |
| `flowAllows` lets a record flow into fetch, serve or frame | "what a record may flow into" | 20 pass, 1 fail | 21 pass |
| `overCode` judges one microsecond late (`<` for `<=`) | "verdicts agree with the kernel's" | 20 pass, 1 fail | 21 pass |
| `persistent` drops the majority rule | "a majority of turns must be over" | 20 pass, 1 fail | 21 pass |
| Export ignores whether the user asked | "typed refusals" | 20 pass, 1 fail | 21 pass |

Defects 3 to 5 are also excluded by proof in the LexLean source (`zeroEgress`, `withinBudgetNeverOver`/`overBudgetNeverWithin`, `noSuggestionFromMinority`); the tests hold the data form the tab runs to that source.

## Lean rounds

| Round | Result | Correction |
| --- | --- | --- |
| 1 | `LLT4001`: `linear_arithmetic` definitions not sorted | Sorted every list (bytewise) |
| 2 | `LLV7002`: `omega` could not see through a record projection in `onlyApprovalChangesAnything` | `loopStep` built from three scalar functions; the theorems are about `loopApplied` |
| 3 | `LLV7005`: `persistentOverIsSuggested` observed `Classical.choice` | Declared it |
| 4 | `LLV7005`: `zeroEgress` observed `Classical.choice` | Declared it |
| 5 | Verified | |

## Measured

- Replayed turn in headless Chrome (model time at 100x): preview 30 ms, first declaration to pixel 8.7 to 11.8 ms, worst update 3.2 to 3.7 ms, edit to screen 3.5 to 5.3 ms, module complete to Checked 12 to 15 ms, 130 to 134 events, 60 to 62 paints, one frame load.
- A probe mark: about 290 to 380 ns in Chrome (in-app browser), under 5 us asserted in Node.
- Interpreter limit: the model's list functions recurse once per event; in Node 1,000 events read in about 80 ms and 2,000 overflow the stack. The probe holds at most 1,024 events a turn and counts the rest as dropped.
