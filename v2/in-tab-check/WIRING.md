# The in-tab checker, wired into the studio

Status: built and measured, not for `main`. The checker is compiled from a patched LexLean (UOR-Foundation/LexLean issues 494 and 495) and Foundry ships no fork. Nothing here is deployed. The checklist for the day upstream lands is section 7.

Result: in the studio a stateful app's module is checked in the tab, and by the hosted service only while the tab's checker loads or cannot run. The card says which. Edit to verdict went from 563 to 988 ms (hosted) to 77 ms. Edit to first frame went from 1,385 ms to 8 ms. Once the checker is loaded nothing is sent to a server, and the studio checks and previews with the origin unreachable.

## 1. What was built

| Piece | File | Role |
| --- | --- | --- |
| Routing | `studio/shell/live/app.mjs`: `appChecker`, `routeLine`, `card` | In the tab when ready, hosted otherwise; `only: "in-tab"` never sends. Returns what `checkApp` returned, plus `by`, `cached`, and `data` on a pass. |
| Browser parts | `studio/shell/live/in-tab.mjs` (new) | Waits for the service worker, reads the manifest, fetches the checker by address, keeps it in the Cache API, keeps results in IndexedDB. Loaded after the page is idle. |
| Host | `studio/shell/host.js` | Every check and every data form goes through `appChecker`. Starts the checker at idle. Records `by` in `prism/app.json`. |
| Service worker | `studio/shell/sw.template.js` | Answers the worker's script with a no-connection policy. Answers the manifest, the worker's scripts and the pack only with the closure's bytes (else 409). Leaves `checker/` alone. |
| Projector | `studio/core/src/bin/project_shell.rs` | Leaves `checker/` out of the closure. |
| Copies | `studio/tools/v2_engine.mjs` | Six files under `studio/shell/live/v2/in-tab/` are held byte for byte to `v2/in-tab-check/`. |
| Checker changes | `client.mjs`, `checker.mjs`, `worker.mjs` here | `data` (the data form without a check), a store the page holds, a policy probe, a retry, lazy `parts`. |
| Tests | `studio/tools/live_app_tab.test.mjs` (new) | 11 tests, section 5. |
| Dev server | `studio/tools/overlay_serve.mjs --closure [--checker-fault]` | Serves this branch's service worker with a closure of its own, and the built checker. |

Two terms. The closure is the list of shell files with their SHA-256 that the service worker caches and verifies. The data form is the JSON of a module that the interpreter runs to draw the preview.

## 2. How a check runs

1. First load: the page imports `client.mjs` and nothing else of the checker.
2. At idle after load the host starts the checker. It waits until the service worker controls the page.
3. Through the service worker it reads `checker-lean.json` and `pack.json` (closure bytes or 409), and starts `worker.mjs` (closure bytes, served with the policy).
4. The worker is asked to fetch its own address. It must fail with a policy violation. If it does not, the worker is handed nothing (`ITC_POLICY`).
5. The page fetches `checker/sha256-<hex>.wasm`, hashes it, keeps it in the Cache API under that name only if it matches, and hands it to the worker. The worker hashes it again before compiling (`ITC_ADDRESS`) and checks the LexLean it reports (`ITC_VERSION`).
6. From then on `check` and `data` are answered in the tab. Before then, or after a failure, the hosted service answers and the answer carries the reason.

What the user sees, in the chat card where "checked" and "not checked" already appear:

- "Checked in this tab."
- "Checked by the hosted service while the checker in this tab loads."
- "Checked by the hosted service, because the checker in this tab could not run: <reason> (<code>)"

On demand: `prism/app.json` in the project holds `by`, with the route, LexLean's version, its compiler-semantics ID, and the addresses of the checker and the pack. `window.__live.checker.detail()` gives the same for the loaded checker.

Never sending a module: the call option `only: "in-tab"`, and the user setting `specStaysInTab`, which the host reads before every check and every data form. With it set and the tab's checker unable to run, the card says the module could not be checked and that nothing was sent. There is no control for this setting in the settings screen yet; that needs a change to the vendored renderer.

A failure that can pass (a fetch that failed, memory that could not be had) is tried again in the background at most once a minute. A refusal (`ITC_ADDRESS`, `ITC_VERSION`, `ITC_IMPORT`, `ITC_POLICY`, `ITC_MANIFEST`) is final until the page is loaded again.

## 3. The worker's policy on a static host

Established, in Chrome 156: a policy the service worker sets on the response for `worker.mjs` binds the worker. From inside the worker a fetch to its own origin, to `https://mcp.uor.foundation/` and to `https://example.com/` was refused, each with a `securitypolicyviolation` event.

Also established: with no service worker the same script has no policy. From a page the worker did not control, the worker's fetch to its own origin was answered.

So on a first visit the policy cannot hold until the service worker controls the page, and the design does not pretend otherwise:

- The checker is not started until the page is controlled. On a clean first visit that took a few seconds; meanwhile the hosted service answers and the card says so.
- Whatever the page believes, the worker must prove the policy before it is handed a byte (step 4). A fetch that fails for another reason, such as no network, reports no violation and does not count.
- With no service worker at all (a browser without one, a forced reload, which leaves the page uncontrolled), the tab's checker is not used. The hosted service checks and the card gives the reason. Under `only: "in-tab"` the check fails and says nothing was sent.

This is the strict choice. The other choice, running the checker unbound when there is no service worker, would keep the module in the tab in that case, at the price of a worker with no policy. The WebAssembly module imports no network call either way. It is one line to change (`probe` in `in-tab.mjs`) and it is the owner's call.

## 4. Measurements

In the Claude desktop in-app browser (Chrome 156, Windows 11), from `overlay_serve.mjs --closure` on localhost, 12 runs each, the machine busy with other builds. Each run edits the module so nothing is reused. Module: `v2/loop/answers/guests-3.verified.lex.tex` (7.1 KB).

| Measure | In the tab, median / worst | Hosted (`v2/hosted-check/REPORT.md`), median / worst |
| --- | --- | --- |
| Edit to verdict, module passes | 77 / 106 ms | 563 to 988 / 1,121 to 1,718 ms |
| Edit to verdict, type refusal | 58 / 72 ms | 544 to 735 / 816 to 1,612 ms |
| Edit to first frame written | 8 / 15 ms | 1,385 / 2,240 ms |
| Whole end-of-turn step (check, kernel phase, project write) | 109 / 132 ms | not measured |
| Same module again, same page (memory) | 2.2 / 4.5 ms | as a new one |
| Same module after a reload (IndexedDB, verified on read) | 3.3 / 9.7 ms | as a new one |
| First check after the checker starts | 247 to 466 ms (3 runs) | |

The two first-frame figures are not the same journey. Hosted, the frame waited for the check. Here the preview reads the data form in the tab without waiting for the verdict. "Written" is the frame posted to the preview; the paint after it was reported 13 ms after the edit in the 5 runs where the pane was drawing.

Edit to verdict is the function the turn calls, with no typing pause added.

First visit, clean storage, localhost: the checker was ready within 6.1 s of navigation. A check asked before that was answered by the hosted service in 1,175 ms and labelled. The checker's fetch took 142 ms for 15.1 MB uncompressed, which says nothing about a network.

Nothing leaves: after the checker was ready, 12 rounds of checks, frames and turns made 66 requests, all to the page's own origin, none to `mcp.uor.foundation` (the browser's resource timing; the pane's network log does not list those calls). The checker's bytes were fetched once and read from the Cache API on later loads.

Offline: with the server stopped and the page reloaded, the studio loaded from the service worker, the checker became ready, a new module was checked in the tab in 247 ms, and the preview drew it.

Size, gzip level 9:

| When | What | Bytes |
| --- | --- | --- |
| First load | `client.mjs` | 2,200 |
| First load | growth of `app.mjs` and `host.js` | 1,406 and 689 |
| After idle | `in-tab.mjs`; `worker.mjs`, `checker.mjs`, `wasi.mjs`; the manifest | 1,878; 9,206; 747 |
| After idle | `pack.json` | 20,299 |
| After idle, once | the checker | 3,499,274 (15.1 MB raw) |

So the first load grows by 4.3 KB. The 60 KB budget is held by a test for the v2 page (`v2/site/test.mjs`), which this work does not touch. The studio shell's own first load is 603 KB by `studio/PERFORMANCE.md` and its budgets are the kernel's (`tools/perf_budget.mjs`), which measures the renderer's chunks; that gate was not run here.

A stored result is about 23 KB. The last 64 are kept.

## 5. Evidence

`node --test studio/tools/live_app_tab.test.mjs`, 11 of 11, on the files the shell serves and the built lean checker, the hosted service replaced by a stand-in that answers what the SDK image recorded:

- Each of the 17 corpus files gets the verdict, the issue lines and the result keys the hosted path gave.
- Loading: hosted, labelled. Ready: in the tab, hosted not asked. Wrong bytes: hosted, `ITC_ADDRESS`, the checker never ran. Stopped mid-check: hosted, `ITC_TRAP`, next check in the tab. No policy: `ITC_POLICY`, nothing handed over.
- `only: "in-tab"` sends nothing in any state.
- A failure that can pass is retried once a period; a refusal is not.
- A stored result is reused by a new worker; an altered one is not believed; a failing store is an empty store.
- The preview runs from the tab's data form, and from a check's own data form with no call.
- The service worker's own fetch handler: the policy header, 409 for bytes the closure does not list, `checker/` not answered.

Planted defects, each caught and restored: `studio/VERIFICATION.md`, row "In-tab check" (seven in code, one in the browser: a checker with one byte changed gave the hosted route with the reason, not a pass).

Also run, on this branch with `main` merged in (`5fe6c73`): `node --test v2/in-tab-check/test.mjs` (34 of 34), `node studio/tools/v2_engine.mjs --check` (13 ok), `node studio/tools/shell_parse.mjs`, every `studio/tools/*.test.mjs` (202 pass, 0 fail, 2 skipped), and the lane's `studio/tools/generation_patch_browser.mjs` in Chrome (passes).

Why `main` is merged in. The pull request's first CI run failed in two places that were not the missing checker: `acceptance` (`current_main_integration_fa_24`: tests 1 to 3 and 7, "appShape is not defined") and `lane` (`generation_patch_browser.mjs`: "no-op batch lost source binding before rules"). Both harnesses cut `rulesAfterTurn` out of `host.js` and run it alone. On the base branch (`claude/in-tab-checker-63d945`, 14 commits behind `main`) that function still held the app-shape code, which needs `appShape`; `main` moved that code into `appAfterTurn` (`657b6de`). Both failures reproduce on the base branch alone, locally, and both pass on `main`. Pull request 154 shows green only because GitHub tests it merged into `main`, and its lane did not run. The wiring now sits in `appAfterTurn`, and the three harnessed functions are `main`'s bytes. Until the base branch takes `main` too, this pull request's diff also shows `main`'s 14 commits.

What still fails in CI, and must: the `lane` step "A module is checked in the tab first, by the hosted service only while the tab cannot, and the card says which" (`node --test tools/live_app_tab.test.mjs`). It reads the built checker at `v2/in-tab-check/dist/lexlean-tab-lean.wasm`, which is not committed because it is built from a patched LexLean.

Seen once and worth knowing: on one first visit the browser could not give the checker its memory ("Cannot allocate Wasm memory for new instance") while other tabs held instances. The studio fell back to the hosted service and said why. That is what led to the retry.

## 6. Not established

- Any browser but Chromium, and any phone. In particular: whether a service-worker-set policy binds a worker in Firefox and Safari (if not, the probe fails and those browsers stay on the hosted route, with the reason), and whether a phone gives the instance its 90 MB.
- The projector change compiles. `cargo check` failed in WSL inside the `cc` crate, whose files are missing from that machine's registry; the edit is one condition and `rustfmt` parses the file.
- `just vv`, `just model-write`, `scripts/lane.sh`, `tools/perf_budget.mjs`, `tools/live_e2e.mjs`: not run. They need the SDK image, the renderer's build or Playwright. The studio was run with the deployed renderer and core under this branch's shell files, so the page the core projects and the lane's closure were not exercised; the dev server computes a closure the way the projector does.
- The model. The check path has no ID in `model/ids.toml` today (the hosted check never had one; the studio's gates are in `studio/VERIFICATION.md`). This work followed that and registered nothing.
- Agreement of the two routes beyond the corpus. The tab runs LexLean 0.3.0, the SDK's. The hosted service runs 0.4.0. A verdict from the fallback can differ from the tab's on a file the corpus does not cover; the card names the route for that reason.
- Download time on a real network, and whether the static host compresses `.wasm`.
- A real chat turn from a model. The turn's own functions were called (`pushApp`, `rulesAfterTurn`, `refreshLive`), not the model.

## 7. The day upstream lands

1. LexLean takes requests 1 and 2 (issues 494, 495) and the SDK image moves to that LexLean. `prismpm.lock` changes, and the test that ties `checker.json`'s image to it fails until the next steps are done.
2. The SDK publishes the checker with its digest in `prismpm.lock` (request 5 in `UPSTREAM.md`). Delete `crate/`, `upstream/` and `build.sh`; the gate becomes one comparison of addresses.
3. Re-record the image's results and the agreement on the new image; rewrite the pack and the manifests (`make-pack.mjs`, `make-manifest.mjs --write`); `node --test v2/in-tab-check/test.mjs`.
4. `node studio/tools/v2_engine.mjs --write`, then `--check`.
5. In the lane and in `pages.yml`: place the checker at `studio/shell/checker/sha256-<hex>.wasm` before the projector runs, and where `live_app_tab.test.mjs` reads it. Build the projector and confirm `manifest.json` lists `live/v2/in-tab/*` and nothing under `checker/`.
6. Run what could not be run here: `just vv` in the SDK image, the lane, `tools/live_e2e.mjs` with an app module, `tools/perf_budget.mjs`.
7. Open the deployed preview in Firefox, Safari and on a phone. Read `window.__live.checker.state()` and `detail()`. Fix or accept what the probe says there.
8. Decide: register the capability in the model or keep it under the studio's gates; a control for `specStaysInTab` in the settings screen; whether a page with no service worker may run the checker unbound (section 3); whether the v2 studio page (`v2/hosted-check/studio.html`) moves too.
9. Rebase on `main` after pull request 154, bring `v2/ARCHITECTURE.md` (its account of `checkApp`) and `REPORT.md` section 7 up to date, then take this out of draft.
