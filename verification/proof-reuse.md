# Proof reuse (FA-85)

Authority: `app/src/FoundrySpecification.lex.tex::proofReuseBoundary` and `ProofReuseRefusal`.
Implementation: `studio/shell/prism/proof-reuse.mjs`, used by `proveFiles` in `studio/shell/prism.js`,
which both proof paths call (decision apps through `prove`, LexLean-module apps directly). The host passes a
store over its `refs` records on both paths.

Order of work: the implementation and its Node suite were written before the register row; the row,
scenario and conformance test were added with `just new-capability` afterwards. R3's order was not
followed for this capability.

## What it does

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

LIVE_RESULTS

## Gates

LOCAL_GATES
