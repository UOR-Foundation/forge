# Release automation conformance integration

FA-85 and FA-86 are declared by `FoundrySpecification` and registered once in
`model/ids.toml`. Their Gherkin scenarios and Rust entry points precede the CLI
implementations. `model/ledger.toml` and `model/authorities.toml` remain unchanged:
the local adapter claims are not duplicated as imported guarantees or measured
claims. External GitHub, reviewer and signature observations remain distinct
from local checks and complete release qualification.

## Initial red boundary

Before either implementation was present, the real conformance commands refused:

- `cargo test --locked -p repo-conformance --test release_readiness` failed
  `release_readiness_fa_85`: Node could not find
  `studio/tools/release_readiness.test.mjs`.
- `cargo test --locked -p repo-conformance --test kernel_adoption` failed
  `kernel_adoption_fa_86`: Node could not find
  `studio/tools/kernel_adoption.test.mjs`.

The implementation suites separately plant a missing-module failure before
implementing their imported CLI modules. Implementation-specific defect controls
and results belong in `release-readiness.md` and `kernel-adoption.md`.

## Mandatory execution

The Rust tests are ordinary workspace integration tests, so the unchanged
`just vv` executes them through `cargo test --workspace --locked`. Each captures
Node's TAP report and requires one exact tests/pass total and zero failures,
cancellations, skips or todos. A missing suite is a failure, never a no-op.

FA-86 first runs `npm ci --prefix studio/tools/kernel-adoption --ignore-scripts
--no-audit --no-fund` from the repository root. Its exact committed production
lock supplies the actual archive verifier even in a clean SDK checkout. A warmed
coordinator module directory, an optional Studio-only install or an alternate
handwritten verifier cannot satisfy that prerequisite.

The Studio workflow independently installs that same lock and runs both Node
suites unconditionally after Node setup, before the longer renderer/browser
stages. Neither universal `Justfile` nor bootstrap policy is modified. Workflow
wiring and wrapper totals must continue to name the real suites without filter,
conditional omission or failure suppression.

## Qualification record

`cargo run -q --locked -p xtask -- check-model --write` regenerated
`CONFORMANCE.md` from the actual register; the read-only check recognizes 113 IDs.
Local formatting and whitespace checks passed for the integration changes.
A local `xtask validate` passed the model, error, deferral and dependency-update
checks, then correctly refused `audit-bootstrap` because the process was not
inside the digest-selected SDK. This is not a successful full `just vv`.

Complete final Node/Rust results, planted-defect restoration, exact-SDK `just vv`,
new canonical signed component reproduction and hosted/browser/performance
acceptance must refer to the final candidate, not the older delivered main.
The main delivery and independent proposal holds are recorded separately in
`release-acceptance-residuals.md`.

### Integrated FA-85 controls

The final readiness suite executes 84 tests, all passing, with zero failures,
cancellations, skips or todos. Its Rust wrapper fixes both the tests and pass
count at 84. On the integrated implementation,
`cargo test --locked -p repo-conformance --test release_readiness` passed.
Three deliberate wrapper-boundary defects were rejected by that same command:

- Changing the first production suite case to `test.skip` failed the suite's own
  omission check and the Rust gate.
- Adding `--test-name-pattern=^FA85` to the Rust invocation failed with
  `incomplete oracle`; a filtered passing subset is insufficient.
- Pointing the wrapper at the unrelated seven-case
  `proof_approval_cancellation.test.mjs` failed with `incomplete oracle`, even
  though that other suite passed.

All mutants were removed and the unchanged 84-case wrapper passed again.
This is focused local evidence, not the full exact-SDK or hosted release gate.

### Integrated FA-86 controls

The final adoption suite executes 60 tests, all passing, with zero failures,
cancellations, skips or todos. A fresh `npm ci` using its committed production
lock followed by both Node suites passed all 144 controls. Both exact-count Rust
wrappers passed; FA-86 performs its own fresh locked installation before replay.
The adoption controls include the actual committed holo's verification and
acceptance replay, not just injected metadata fixtures.

`cargo test --locked -p repo-conformance --test kernel_adoption` rejected each
planted omission: a `test.skip` case, a test-name filter excluding the suite, and
an invocation pointed at the unrelated seven-case cancellation suite. Filtered
and wrong-suite reports failed with `incomplete oracle`. The restored 60-case
wrapper passed. Adding `if: false` to the mandatory Studio suite step also failed
the suite's workflow-omission control; the workflow was restored before checking
or committing the final candidate.

These focused controls qualify the local adapters and mandatory execution
boundary. They do not replace new signed-build provenance, the full immutable-SDK
acceptance command, complete browser/performance gates or live deployment.
