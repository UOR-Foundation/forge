# Proof reuse (FA-85)

Authority: `app/src/FoundrySpecification.lex.tex::proofReuseBoundary` and `ProofReuseRefusal`.
Implementation: `studio/shell/prism/proof-reuse.mjs`, used by `proveFiles` in `studio/shell/prism.js`,
which both proof paths call (decision apps through `prove`, LexLean-module apps directly). The host passes a
store over its `refs` records on both paths.

Order of work: the implementation and its Node suite were written before the register row; the row,
scenario and conformance test were added with `just new-capability` afterwards. R3's order was not
followed for this capability.

## Current trust boundary

FA-85 is hardened by [proof-reuse-trust.md](proof-reuse-trust.md). Reuse now requires a fresh,
toolchain-bound service descriptor and the exact attestation under that descriptor. Legacy records,
bare `found: true`, retired SDK Lean digests and unsupported metadata are refused for reuse. The live
service observed on 2026-11-13 does not supply this contract, so this candidate proves the entire app
and stores no reusable records there. Fresh-proof acceptance and publication are unchanged.

The eight-test results and hosted timings below describe the original implementation, not the new
trust boundary or its current hosted performance. The new controls and qualification limits are in
the linked verification record.

## Original implementation and measurements


Each theorem gets an address from the verifier's identity, the library files, the author modules' headers,
the theorem's own declaration and every author declaration it reaches by name. A verified run files one
record per proved theorem with the exact author files sent. A later proof reuses a theorem only when its
record re-derives (digests, headers, the theorem and every reached declaration held in the files) and the
verifier still reports an attestation for each file digest. Reused theorems are taken out of the files Lean
is sent; when all are reused, Lean does not run.

What it does not do: it is not a second kernel check, it does not prove the verifier's lookup sound, a
verifier upgrade that keeps its profile identity reuses earlier proofs, and publication still proves the
whole app again in the SDK image.

## Tested

`node --test studio/tools/proof_reuse.test.mjs`: 8 of 8 pass, run by `crates/conformance/tests/proof_reuse.rs`
with an exact count. The verifier there is a fake that attests exactly the files it verified; the renderer,
the address, the admission and `proveFiles` are the real code.

Planted defects, each applied to the file, the suite run, and the file restored byte for byte (SHA-256
compared), after which 8 of 8 pass:

| Defect | Failing tests |
| --- | --- |
| A failed reuse lookup fails the proof | 1 |
| The attestation lookup is skipped | 2 |
| The address omits reached declarations | 1 |
| The canonical form drops whitespace between tokens | 1 |
| Reused theorems are still sent to Lean | 2 |
| A store failure propagates | 1 |
| The header check is skipped | 1 |
| The host proves decision apps without a store | 1 |

The address defect was first missed: admission still refused the stale record, so behaviour stayed safe,
but nothing tested the address itself. A direct assertion was added. The lookup defect was also first
missed, because the profile lookup is cached for the page's life; the test now fails the attestation
lookup, which runs on every decision.

## Measured against the hosted verifier

`node studio/tools/proof_reuse_live.mjs` (not part of the gate; sends the fixture's files, unlisted):

Run on 2026-11-13, the parking-fee fixture with three guarantees, one in-memory store, Node 22.21 on
Windows. One run each; wall times include queueing on the shared verifier.

| Step | Lean runs | Theorems sent | Reused | Wall time | Calls to the verifier |
| --- | --- | --- | --- | --- | --- |
| Cold | 1 | 3 | 0 | 105.4 s | profiles 1, draft 1, verify 1, task polls 16 |
| Unchanged | 0 | 0 | 3 | 1.9 s | attestation lookups 4 |
| One guarantee edited | 1 | 1 (`inv002Holds`) | 2 | 146.6 s | attestation lookups 4, draft 1, verify 1, task polls 10 |

The unchanged case confirms the assumption the admission rests on: the hosted verifier reports an
attestation for the SHA-256 of each file it verified. The edited case sent one theorem instead of three
but took longer than the cold run: on the hosted verifier a run's cost is mostly fixed (queue, Lean start,
elaborating the model), so leaving theorems out saves Lean work, not wall time, at this size. The large
saving is when nothing the theorems depend on changed. Neither run needed an axiom correction round, so
the saving from cached axiom sets was not observed here; the Node suite covers it.

## Gates

`just vv` passed at c5372a3 inside `prismpm-sdk-candidate@sha256:cd3b47d7…`, from a clone on the WSL Linux
disk, in 2,782 s: fmt-check, model, template-check, lint, the workspace tests (`proof_reuse_fa_85` ok),
deny and app (`prismpm --project app verify`, attestation `6009c3b3ebea7c54c944d5c4f65437911f6b9f6490870a8fd31735e16e8a8d44`).
The only later change is this file.

Every Studio Node suite was also run on this branch and on `main` 7b5fdb9. They differ only by
`proof_reuse` (new, 8 of 8) and `snapshot_bound_builds`, which needed the new module listed in its browser
fixture and passes 7 of 7. Six suites fail one test each on both, unchanged by this work:
backlog_workflows, browser_chat_mode_controls, command_ownership_registry, live_main_integration,
semantic_application_discovery and verified_host_bundle. They are not in `just vv`.
