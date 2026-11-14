# Backlog workflow reconciliation

The combined application stack preserves the full immutable-SDK acceptance boundary and all existing browser and performance checks. No thresholds, CSP, or universal policy files are relaxed.

The Pages cache key now includes the stateful engine inputs in `v2/shell`, `v2/loop`, and `v2/probe-payment/data`, `v2/probe-payment/src`, and `v2/hosted-check`, because the current renderer imports those sources. Unconsumed prototypes remain excluded. Performance workflow path filters cover the same inputs. Cache misses stage the locked compiler and renderer before projecting and auditing the complete shell closure. Browser acceptance uses the renderer's locked Playwright package and invokes the replay script with Bash.

Independent review identified the additional hosted-check and browser-model source inputs; the input coverage control now derives its source list directly from the engine projector rather than a hand-maintained subset.

Four controls in `studio/tools/backlog_workflows.test.mjs` verify input identity, locked browser selection, staging order with cache-miss guards, and the complete browser command inventory with failure aggregation and verified prerequisites. Omitting `v2/loop/**` from the reuse key fails the intended assertion, `reuse omits v2/loop/**`. Restoring it passes. All four controls run through both the Studio workflow and FA-24's complete conformance invocation: 33 tests, 33 passes, no skipped or filtered controls.

These local results qualify the inspected workflow reconciliation only. Fresh combined-tree SDK, kernel construction and identity replay, full Studio/browser runs, and both performance lanes remain required before merge.


## Reviewed browser inventory repair (2026-11-14)

At main `6d8021ff583873fb51abcc4bdd5c8ec2d84ee06a`, #193 added
`run node tools/plain_chat_layout_browser.mjs` to the storage/browser block.
The fourth workflow control still expected 64 commands. The complete FA-24
Node invocation reproduced 33 tests, 32 passes and one failure:
`mandatory command count changed for Verify snapshot rollback in browser storage`
(`65 !== 64`).

The repaired control pins nine host-scope and 65 storage/browser commands in
reviewed order, including interpreters and arguments. It checks uniqueness and
exact equality, rather than only count or deriving the expectation from the
workflow under test. Intended additions must update the reviewed inventory.
Workflow commands, guards and failure aggregation are unchanged. The four
top-level workflow tests and FA-24's exact 33-control requirement are unchanged.
No product, model, SDK, kernel, identity or UI files change.

Negative controls remove and substitute each command, and reject unreviewed
additions, same-count duplicate replacements and reordering. Full-workflow
mutations remove, replace or conditionally skip the plain-chat command and
fail on inventory mismatch or omitted execution. Existing fail-open, fail-fast
and missing-prerequisite mutations remain active. A separate temporary test
copy restoring count-only equality fails with `Missing expected exception` on
an unreviewed same-count substitution. Mutated copies are not retained.

Restored local results on Node 24.22.1:

- `node --test studio/tools/backlog_workflows.test.mjs`: 4/4 passed.
- `node --test --test-reporter=tap studio/tools/current_main_integration.test.mjs studio/tools/rules_transaction.test.mjs studio/tools/main_stateful_integration.test.mjs studio/tools/notation_host_integration.test.mjs studio/tools/backlog_workflows.test.mjs`: 33/33 passed, zero failures, cancellations, skips or todos.
- `node --check studio/tools/backlog_workflows.test.mjs` and `git diff --check`: passed.

These focused host-tool checks are not full release acceptance. Docker, Cargo
and Just are unavailable here, so locked-SDK `just vv`, the Rust wrapper and
the real browser lane have not run locally. Exact-head CI remains required
before readiness or merge.
