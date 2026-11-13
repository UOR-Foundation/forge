# On-device build telemetry: design

Foundry measures each build turn on the user's device, keeps the records in that browser, shows them with suggestions when asked, and sends them nowhere. Evidence is in [VERIFICATION.md](VERIFICATION.md); read "Not established" first.

## Where things are

| What | Where |
| --- | --- |
| The Telemetry model (records, KPIs as functions of events, verdicts, suggestion rules, the loop) | `studio/telemetry/src/Telemetry.lex.tex`, 21 theorems (TL-01 to TL-21) in `TelemetryProofs.lex.tex` |
| Where a record may go | the Forge kernel: `telemetry EFFECT ASKED DEVICE`, FK-25 to FK-27 (`app/src/ForgeKernel.lex.tex`) |
| The budgets | the Forge kernel: `budget JOURNEY VALUE` (FK-22 to FK-24); telemetry asks, it keeps no number |
| The tab's copy of the model | `studio/shell/telemetry/data/*.json`, the toolchain's data form of the checked sources, run by `shell/live/v2/interp.mjs` |
| Probe, store, report, Prometheus files, panel | `studio/shell/telemetry/` |
| Marks in the turn | `studio/shell/host.js`, the block headed "build telemetry" |

## Measurement

- Clock: `performance.timeOrigin + performance.now()` in whole microseconds. It is monotonic and puts the page, the frame and a worker on one time line.
- The probe writes four numbers into a preallocated `Float64Array`: no allocation, no promise, no message, no storage on the hot path. About 0.3 us a mark in Chrome. It holds 16,384 events a turn and counts the rest as dropped.
- Marks: Enter, first token, first whole declaration, module complete, check, reads (first try or after one repair), refusals and each preview update in `host.js`'s `chatTurn`; the frame's first load, each paint and each edit at the host's `live/*` message handler; reloads in `publish`. The frame already posts `live/painted` on the animation frame that paints, so a pixel time is that paint plus one message hop.
- A turn is one record, written at idle after the turn.

## KPIs

Each KPI is a function of a turn's events, defined in the model. The model has no recursion: a turn is a fold of `step` over its events (events from several contexts are first put in time order), so a turn of any length costs one interpreter call an event.

Enter to preview frame, Enter to first declaration, first declaration to first pixel, worst work per update, worst edit to screen, module complete to Checked, Enter to Checked, preview reloads, and, for the loop, Enter to first token, first token to first declaration, first declaration to module complete, modules reading at the first try or after one repair, refusals, checks reused and checks run. Each is absent, not zero, when the turn had no such journey.

## Storage, view, export, erase

- IndexedDB, origin-scoped, one record per turn, at most 512 (`keepLimit`, TL-21). IndexedDB rather than OPFS because the main thread writes, and OPFS's synchronous handles are worker-only.
- Ctrl+Alt+T or `#telemetry` opens a dialog: each KPI's last, mean, worst, budget and verdict, reads and checks per model, and the suggestions.
- Saving is only on the user's click, and the kernel allows it only then (FK-26): a Prometheus text snapshot (0.0.4), an OpenMetrics history (for `promtool tsdb create-blocks-from openmetrics`), alert rules that judge as the kernel does (over at budget + 1 ms), and the turns as JSON. "Erase everything" deletes the database.

## Zero egress as a checked property

1. Kernel (proved): a record may be stored, shown, saved when the user asked, or read by a model on the device, and nothing else (FK-25 to FK-27). Every flow in `telemetry.mjs` asks the kernel first and a non-`allow` answer is a typed refusal; nothing is written.
2. Source: `studio/tools/telemetry_egress.mjs` refuses any network API, URL scheme, `postMessage` to "*", import outside the telemetry's siblings and the interpreter, any file it neither scans nor names, and any file outside the telemetry that imports the store.
3. Run time: `telemetry.test.mjs` replaces `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` with tripwires and runs record, report, the loop, every export and erase: none is touched.
4. Planted defects (`studio/tools/telemetry_defects.mjs`): a `sendBeacon` in the store, an unlisted file, an adapter that ignores a kernel denial, a verdict one microsecond late, a dropped majority rule, an export that ignores the user's ask. Each fails a gate.

## The loop

Deterministic and on device. A KPI over budget in most observed turns gets one lever; "declaration" chooses reasoning versus declarations-first from the stage totals; "built" names its largest stage; a model switch needs 5 reads from each model and a better first-try rate. Adopting is the user's own note that they made the change, and only that changes the loop's record (TL-18); the loop then compares the KPI's mean before and after (TL-20). A model could only phrase suggestions if it runs on the device, which the kernel already allows (`infer` with DEVICE yes); records are never sent to a relay. Not wired.

## Rejected

- A hosted analytics service or a model relay: egress, and the records are the user's.
- Prometheus scraping or Pushgateway: a tab listens on nothing, and pushing is egress. Interoperability is by file, in Prometheus's own formats.
- OPFS: worker-only synchronous handles; IndexedDB serves one write a turn.
- User Timing / PerformanceObserver as the store: it allocates per entry and does not cross contexts.
- Budgets in the telemetry model: the kernel is the single source.
- A recursive model over event lists: exponential and stack-bound in the interpreter; the fold has neither.

## Not established

- The kernel decision FK-25 to FK-27 is checked, formatted and Lean-verified in the SDK image (not yet built into a holo by `just app`); the shell's pinned kernel changes only when `kernel-pin.yml` rebuilds it. Until then the shell asks a kernel that answers `invalid` to `telemetry`, a typed refusal, and no record is kept.
- The panel and the `host.js` marks have not been run in the built shell. The turn and the frame are timed where the host already hears about them; a real model's turn through the real frame has not been captured.
- The replay behind the tests runs model time on a schedule; the 11 seeded turns in `studio/tools/fixtures/telemetry_turns.mjs` are synthesized from the owner's hand-measured ranges, not captured.
- KPI values are folds over events, checked and tested, not proved: there is no induction tactic. Their parts are proved (TL-01 to TL-08).
- Interpreter and compiled guest agreement for the Telemetry model: no holo was built.
- Safari, Firefox, storage under quota pressure, and cross-origin-isolated clock resolution were not exercised.
- A browser extension or devtools can read a page's storage; zero egress is about Foundry's code, not the user's own browser.
