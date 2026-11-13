# Backlog workflow reconciliation

The combined application stack preserves the full immutable-SDK acceptance boundary and all existing browser and performance checks. No thresholds, CSP, or universal policy files are relaxed.

The Pages cache key now includes the stateful engine inputs in `v2/shell`, `v2/loop`, and `v2/probe-payment/data`, `v2/probe-payment/src`, and `v2/hosted-check`, because the current renderer imports those sources. Unconsumed prototypes remain excluded. Performance workflow path filters cover the same inputs. Cache misses stage the locked compiler and renderer before projecting and auditing the complete shell closure. Browser acceptance uses the renderer's locked Playwright package and invokes the replay script with Bash.

Independent review identified the additional hosted-check and browser-model source inputs; the input coverage control now derives its source list directly from the engine projector rather than a hand-maintained subset.

Three controls in `studio/tools/backlog_workflows.test.mjs` verify input identity, locked browser selection, and staging order with cache-miss guards. Omitting `v2/loop/**` from the reuse key fails the intended assertion, `reuse omits v2/loop/**`. Restoring it passes all three controls. They run through both the Studio workflow and FA-24's complete conformance invocation, alongside existing source-transaction controls and the eight stateful integration controls: 23 tests, 23 passes, no skipped or filtered controls.

These local results qualify the inspected workflow reconciliation only. Fresh combined-tree SDK, kernel construction and identity replay, full Studio/browser runs, and both performance lanes remain required before merge.
