# Verification evidence

| Gate | Command | Result |
| --- | --- | --- |
| Lean, Telemetry model | `node studio/telemetry/tools/verify-loop.mjs` (`lexlean verify --all` in the image `prismpm.lock` pins; the telemetry workflow runs it) | 21 theorems verified, attestation `e8704972b1af9bc7c0871f8ba39bdc5ef975699b52c3a3fbf514fff8077f8219` |
| Data form | `node studio/telemetry/tools/data-form.mjs`; `telemetry.test.mjs` re-hashes the sources | The tab's data form is read from the checked sources (`shell/telemetry/data/source.json`) |
| Egress gate | `node studio/tools/telemetry_egress.mjs` | 7 shipped files clean |
| Tests | `node --test studio/tools/telemetry.test.mjs` | 24 of 25 pass with the kernel stand-in below; the 25th is the egress gate |
| Planted defects | `node studio/tools/telemetry_defects.mjs` (writes `out/defects.log`) | see "Planted defects" |
| Prometheus | `bash studio/telemetry/tools/prometheus-check.sh` in WSL (`promtool` from `prom/prometheus:v3.5.0`) | `check metrics`, `check rules` and a boundary `test rules` pass; the OpenMetrics history backfills into TSDB blocks and `tsdb dump` reads every turn back. A planted off-by-one rule fails `test rules` (`prometheus-defect.sh`). Run on the format before the move to `studio/`; the code that writes it is unchanged |

## The kernel decision

`telemetry EFFECT ASKED DEVICE` (FK-25 to FK-27) is in `app/src/ForgeKernel.lex.tex`, with 14 acceptance vectors and three theorems in `ForgeKernelProofs.lex.tex`. It checks, formats and locks in the SDK image, and `lexlean verify --all` there verified every kernel theorem, FK-25 to FK-27 included (attestation `df6b3fbcbb6aa9dd43675f3585c8891f71efead21fb2cedc7d2cfd48d06b745f`). `just app` builds and proves the holo and the kernel-pin workflow archives it; neither has run on this change.

The shell's pinned kernel answers `invalid` to a `telemetry` question until that pin is rebuilt, so with the committed pin the kernel-dependent tests fail loudly: the shell refuses to store, rather than store unasked. Run with a stand-in that implements the decision as the model states it (a scratch copy of the test, not committed), the other 24 tests pass.

## Planted defects

Each is planted in the bytes that run: the model's data form, an adapter, or a new file. The harness restores the file and compares its SHA-256.

| Defect | Caught by |
| --- | --- |
| The store sends each turn with `navigator.sendBeacon` | egress gate (`sendBeacon`, `navigator network`); the run-time tripwire |
| An unlisted file joins the telemetry | egress gate ("neither scanned nor named") |
| An adapter lets a flow the kernel denied go ahead | "a kernel that refuses a flow stops it" |
| `overCode` judges one microsecond late | "verdicts agree with the kernel's on every boundary" |
| `persistent` drops the majority rule | "a majority of turns must be over" |
| Export ignores whether the user asked | "typed refusals" |

The harness needs the kernel pin to be current (its baseline must be green); the telemetry workflow runs it.

## Lean rounds

| Round | Result | Correction |
| --- | --- | --- |
| Early | `LLT4001`, `LLV7002` (a record projection hid from `omega`), `LLV7005` axiom sets | Sorted lists; records built from scalar functions; observed axiom sets declared |
| Rewrite to a fold | `LLV7002`: `omega` cannot see through a function that tests `budgeted`, which is `<=?` on a projection | Inline the comparison in `observeOver` and the claims about it |
| Last | `LLV7005`: TL-01 observed `Classical.choice`, TL-02 did not | Declared what Lean observed. Verified |

## Measured

- Replay in headless Chrome earlier in this work (model time at 100x, a stand-in frame): preview 30 ms, first declaration to pixel 9 to 12 ms, worst update 3 to 4 ms, edit to screen 4 to 5 ms, module complete to Checked 12 to 15 ms, 130 events, no reload. Not repeated through the shell's frame.
- A probe mark: about 290 to 380 ns in Chrome; under 5 us asserted in Node.
- 20,000 events fold in about 400 ms in the interpreter.
