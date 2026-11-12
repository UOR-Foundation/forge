# On-device build telemetry: design

Status: prototype in `v2/`, not wired into the shell. Evidence is in [VERIFICATION.md](VERIFICATION.md); read "Not established" first.

## Decision

Measure in the shell, the live frame and the kernel worker with one tiny probe (`probe.mjs`), keep one record per turn in this origin's IndexedDB, and leave every decision to a LexLean model (`src/Telemetry.lex.tex`): the KPIs as functions of events, the verdicts against the kernel's budgets, the suggestions, the advisory loop, what a record may flow into, retention and Prometheus buckets. Prometheus interoperability is by file, never by connection.

## Measurement

- Clock: `performance.timeOrigin + performance.now()` in whole microseconds. Monotonic, and it puts page, frame and worker on one time line, so a cross-context span is a subtraction. Resolution is the browser's: 5 us cross-origin isolated, 100 us otherwise in Chromium.
- Cost: a mark writes four numbers into a preallocated `Float64Array`; no allocation, promise, message or I/O. Measured in Chrome in the in-app browser: about 290 to 380 ns per mark (100,000 marks), about 1/50,000 of a frame.
- Bound: 1,024 events a turn; more are counted as dropped. The model runs in an interpreter that recurses once per event and overflows Node's stack between 1,000 and 2,000 events. A replayed turn records about 130.
- Where: Enter, first token, first whole declaration, complete, Checked, reads and checks in the shell (`host.js` `chatTurn`); frame ready, each paint (with its own work and time) and the edit's start in the live frame, which already posts `live/painted`; a full ring counts drops instead of overwriting.
- Pixel time is the frame's next animation frame after the change, the frame it is painted in; the paint itself is not observable from script.

## Storage, view, export, erase

- IndexedDB, origin-scoped, one record per turn, at most 512 turns (`keepLimit`, `kept`, `evicted`; `keptIsBounded` proved). Chosen over OPFS because the shell's main thread writes, and OPFS sync handles are worker-only.
- The panel (`panel.html`) shows each KPI's last, mean, worst, budget, verdict and turns over, reads per model, and the loop's suggestions. "Erase everything" deletes the database.
- Export only on the user's click (`flowAllows save` needs `userAct`; `saveOnlyWhenAsked` proved): Prometheus text format 0.0.4 (`.prom`, for node_exporter's textfile collector) and OpenMetrics 1.0 with per-turn timestamps (for `promtool tsdb create-blocks-from openmetrics`), plus alert rules that judge exactly as the kernel does (over when value >= budget + 1 ms). Metric names follow Prometheus conventions; budgeted KPI labels are the kernel's journey names.

## Zero egress as a checked property

1. Model: `flowAllows` admits store, show, save-on-user-act and inference only on device; fetch, serve and frame are never allowed (`zeroEgress` proved).
2. Page policy: the panel and frame run under `connect-src 'none'`; data is loaded as script modules so even the page's own JSON is not a connection.
3. Runtime: `browser-test.mjs` records every request in headless Chrome and requires none after load except the saved file's `blob:`.
4. Source: `egress-gate.mjs` refuses any network API, URL scheme, `postMessage` to "*", import from outside the allowed files, an inline script or a page without `connect-src 'none'`, any file it neither scans nor names, and any file outside the telemetry that imports the store. A planted `sendBeacon` in the store and a planted unlisted file both fail it.
5. Run time: `test.mjs` replaces `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` with tripwires and runs record, report, the loop, both exports and erase: none is touched.

## The loop

Deterministic and on device. A KPI over budget in a majority of observed turns gets one lever (`lever`); `declaration` picks reasoning versus declarations-first from the stage totals; `built` names its largest stage; a model switch needs 5 reads from each model and a higher first-try rate. Proved: no suggestion without an over-budget majority, none for an unbudgeted KPI, every persistent over-budget KPI gets one, never a switch to the current model or on few samples. Adopting is the user's note; only approval changes the loop's record (`onlyApprovalChangesAnything`), and the loop then compares before and after (`improvedOnlyWhenFaster`). A model could phrase suggestions only if it runs on device (`flowAllows infer` with `onDevice`); records never go to a relay. Not wired.

## Rejected

- A hosted analytics service or a model relay: egress, and the records are the user's.
- Prometheus scraping or Pushgateway: a tab listens on nothing, and pushing is egress.
- OPFS: worker-only sync handles; IndexedDB serves one write per turn.
- PerformanceObserver/User Timing as the store: allocates per entry and does not cross contexts.
- Budgets in the telemetry model: the kernel is the single source; `budgets.json` is copied from branch `journey-gaps` (commit 1967cca) with provenance until those journeys reach main.

## Evidence

- Lean, in the SDK image pinned by `prismpm.lock`: 15 theorems verified on the current sources, attestation `a8d04f96…`.
- Prometheus's own `promtool` (v3.5.0): the snapshot passes `check metrics`, the rules pass `check rules` and a boundary `test rules`, and the history backfills and reads back every turn. A planted off-by-one rule fails `test rules`.
- `node --test v2/telemetry/test.mjs`: 21 of 21. `node v2/telemetry/browser-test.mjs`: 25 of 25. `node v2/telemetry/defects.mjs`: 6 of 6 caught.

## Not established

- Nothing is wired into the shell (`host.js`, the live frame, the worker): no ID in `model/ids.toml`, no scenario in `features/suites/` (R3), no FK in the kernel. Wiring needs the six marks named under "Where" and a kernel decision `telemetry EFFECT USER DEVICE` (FK-25 onward) mirroring `flowAllows`.
- The replay's model time is a schedule divided by 100: `declaration` and `built` in a replayed turn are the schedule's, not a model's. The 11 seeded turns are synthesized from the owner's hand-measured ranges, not captured.
- Per-model read rates in the replay: the replayed turn is labelled model-a.
- KPIs over list recursion (`kpiOf`, `observe`, `bestSwitch`) are checked and tested, not proved: there is no induction tactic.
- Interpreter and compiled guest agreement for this model: no holo was built.
- A browser extension or devtools can read any page's storage; zero egress is about Foundry's code, not the user's own browser.
- Safari and Firefox, OPFS or IndexedDB under quota pressure, and cross-origin-isolated clock resolution were not exercised.
