# Verification evidence

| Gate | Command | Result |
| --- | --- | --- |
| Check | `v2/telemetry/sdk.sh` in WSL: `lexlean lock && lexlean check --all` in the image `prismpm.lock` pins | Both modules check |
| Verify | `node v2/telemetry/tools/verify-loop.mjs` (`lexlean verify --all` in the same image) | Verified, 15 theorems, attestation `a8d04f961afbabb1cf2cf523356ad12faffffb40e0bedb34a65e100f82c5143a`, of the sources whose SHA-256 `data/source.json` records (the data form the tab runs is read from the same sources). `d5ea4e35…` is the earlier run, before `maxValue`/`worstOf` became linear |
| Hosted verify | `lexlean_verify` on draft `spec/ac81f46e…` (the public service, LexLean 0.4.0, not the locked SDK) | task-8 verified; independent of the SDK run, not a substitute for it |
| Tests | `node --test v2/telemetry/test.mjs` | 21 of 21 pass |
| Egress gate | `node v2/telemetry/egress-gate.mjs` | 12 files clean |
| Browser | `node v2/telemetry/browser-test.mjs` (headless Chrome, DevTools protocol) | 25 of 25 checks pass |
| Planted defects | `node v2/telemetry/defects.mjs` (output in `out/defects.log`) | 6 of 6 caught, every file restored byte for byte |
| Prometheus | `bash v2/telemetry/tools/prometheus-check.sh` in WSL (`promtool` from `prom/prometheus:v3.5.0`), after `browser-test.mjs` wrote `out/` | `check metrics` on the 0.0.4 snapshot: no problems. `check rules`: 3 rules. `test rules`: the alert fires at 16 ms on the 15 ms budget and not at 15.999 ms. The OpenMetrics history backfills into 7 TSDB blocks, and `tsdb dump` reads back all 12 turns (11 at 1.3 s, the replay at 27.9 ms) |

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
| The alert rule judges `>` where the kernel says `>=` (`tools/prometheus-defect.sh`) | `promtool test rules`: expected the alert at 1m, got none | exit 1 | exit 0, SUCCESS |

Defects 3 to 5 are also excluded by proof in the LexLean source (`zeroEgress`, `withinBudgetNeverOver`/`overBudgetNeverWithin`, `noSuggestionFromMinority`); the tests hold the data form the tab runs to that source.

## Lean rounds

| Round | Result | Correction |
| --- | --- | --- |
| 1 | `LLT4001`: `linear_arithmetic` definitions not sorted | Sorted every list (bytewise) |
| 2 | `LLV7002`: `omega` could not see through a record projection in `onlyApprovalChangesAnything` | `loopStep` built from three scalar functions; the theorems are about `loopApplied` |
| 3 | `LLV7005`: `persistentOverIsSuggested` observed `Classical.choice` | Declared it |
| 4 | `LLV7005`: `zeroEgress` observed `Classical.choice` | Declared it |
| 5 | Verified (`d5ea4e35…`) | `maxValue` and `worstOf` then found exponential in the tab; rewritten with an accumulator |
| 6 | Verified (`a8d04f96…`), 214 s | |

## Measured

- Replayed turn in headless Chrome (model time at 100x): preview 30 ms, first declaration to pixel 8.7 to 11.8 ms, worst update 3.2 to 3.7 ms, edit to screen 3.5 to 5.3 ms, module complete to Checked 12 to 15 ms, 130 to 134 events, 60 to 62 paints, one frame load.
- A probe mark: about 290 to 380 ns in Chrome (in-app browser), under 5 us asserted in Node.
- Interpreter limit: the model's list functions recurse once per event; in Node 1,000 events read in about 80 ms and 2,000 overflow the stack. The probe holds at most 1,024 events a turn and counts the rest as dropped.
