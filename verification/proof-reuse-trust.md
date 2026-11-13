# Toolchain-bound proof reuse (FA-85 hardening)

Authority: `FoundrySpecification.proofReuseBoundary` and `ProofReuseRefusal`.
This tightens the existing FA-85 capability; its register ID and statement are unchanged.
The scenario and failing controls were committed before the implementation (`71120c5`).

## Scope and current behavior

The reuse schema is `prism/proof-reuse/2`. Its key includes the local policy epoch, the service trust
epoch, and the SHA-256 addresses of Lean, Lake, leanchecker, LexLean and compiler semantics, in
addition to the existing profile, library and declaration closure. A toolchain or epoch change moves
every address even if the profile ID does not change. The descriptor is read for each operation,
not cached for the page's lifetime.

Every reused record must also carry those exact identities. Lookup is by its exact attestation ID,
not a digest which could resolve to another verification. The response must identify that attestation
as verified under the current descriptor and cover every recorded source digest. Bare existence is
insufficient. Before committing a reused verdict, the descriptor is read again. A change or failed
lookup reruns the entire proof without reuse. After a partial proof, attestation retrieval precedes
that final descriptor read. A completed proof is never filed by relabelling it with a later identity.

Old records remain in the browser store but cannot be admitted. No destructive migration is needed.
The two Lean 4.32.1 executable digests in the existing `prismpm.lock` are retired for reuse. This is
not an allow-list of other toolchains and does not establish that another digest is sound.

**Fresh-proof acceptance is unchanged.** Unsupported reuse metadata triggers full proving and no
reuse-store writes. This patch does not disable proof verification, change the SDK, alter publication,
or claim to fix a kernel. It does not re-evaluate persisted historical app badges outside a proof
request. A full fresh proof continues to trust the configured hosted verifier as before.

## Service contract required for reuse

This is a **proposed consumer contract**, not a claim about a deployed service feature. The service
owner must model, implement and qualify it before reuse is available. A profile response must include:

```json
{
  "name": "prism-app",
  "id": "<64 lowercase hex>",
  "proof_reuse": {
    "schema": "lexlean-mcp/proof-reuse-trust/1",
    "epoch": "<64 lowercase hex>",
    "toolchain": {
      "lean": "<64 lowercase hex>",
      "lake": "<64 lowercase hex>",
      "leanchecker": "<64 lowercase hex>",
      "lexlean": "<64 lowercase hex>",
      "compilerSemantics": "<64 lowercase hex>"
    }
  }
}
```

The epoch must identify the service's current reuse policy and revocations. Tool addresses must be
computed from the running verification toolchain, not copied from a version banner or an old lock.
The attestation lookup must bind the original verification's descriptor, not stamp existing records
with today's descriptor. It must respond with structured fields `found: true`, `status: "verified"`,
`attestation_id`, `files` (an array of covered source SHA-256 digests), and `proof_reuse` (the original
verification descriptor). Any absent, malformed, mismatched or retired field prevents reuse.

The client still trusts this HTTPS service to report its identity and evidence honestly. These
checks are not signature verification, an independent kernel check, a linearizable revocation
protocol, or a proof of service soundness. The final descriptor read establishes an observed current
epoch; a service that reuses epochs after rollback would violate this contract.

## Observed SDK and gateway constraints, 2026-11-13

- Foundry main `efd525f91a62a0fc204c2a4b6c79df3963bb1318` pins
  `ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b47d7a370c4a26b8285f5e9c3bb15e639973c55505c3809ddbe55352fea58`.
  Both platform inventories identify Lean and leanchecker 4.32.1.
- Read-only `lexlean_profiles({profile:"prism-app"})` returned profile ID
  `1cf3dece40ddac370598574170a00eca44fb5243e297e179b455801def90c2c8`, language, packages and roots.
  It returned no current executable addresses or revocation epoch. `tools/list` provided no other
  current-toolchain operation.
- A read-only lookup using the SHA-256 of Foundry's already-public Foundation/Bytes source returned
  structured `{found:true}` and a DSSE envelope in text. Its predicate names the attestation,
  build/source/semantic IDs, modules, covered file digests and verified status, but no toolchain or
  trust epoch. No source was uploaded and no proof task was started for these observations.
- Gateway source at `UOR-Foundation/lexlean-mcp@64f3fcbc6206f4f20d63bef84a5382bcfa3dffbe`
  documents the profile identity as lock-header compiler semantics and Lean-toolchain string plus
  profile files and reviews, not running executable bytes (`PROFILES.md`, `provision.rs`). Its newer
  `ATTESTATION.md` describes `attestationId` and an envelope in structured content. Those fields alone
  still do not meet the proposed trust contract, and the observed deployment did not return them.

These are observations, not a statement that the gateway's currently running Lean was measured.
A profile ID does not expose that fact.

## Kernel risk and ownership

[Lean issue 14576](https://github.com/leanprover/lean4/issues/14576) reports an axiom-free proof of False
through ill-typed nested-inductive projection terms. The upstream fix is
[Lean PR 14577](https://github.com/leanprover/lean4/pull/14577), which adds checks for nested inductive
parametric arguments. Its regression includes the reduced malformed-projection rejection.

Foundry's decision route renders a restricted LexLean model; the stateful route sends author LexLean
modules through the same `proveFiles` boundary. The upstream reproduction uses Lean metaprogramming
and checked declaration construction. This review has **not** demonstrated that this reproduction is
reachable through either production Foundry input route, has not submitted it to the hosted service,
and has not tested it against the pinned SDK. A known dependency defect is not evidence of a Foundry
exploit. The generic gateway also supports core/tooling module data, so that larger input surface
requires its owner's separate reachability and regression work.

Existing owners/work, rather than duplicate implementation:

1. [LexLean PR 433](https://github.com/UOR-Foundation/LexLean/pull/433) owns the 4.32.1 to 4.33.1
   upgrade and its lock/export regeneration. Its recorded Atlas and full-gate blockers must be resolved.
2. [PrismPM issue 647](https://github.com/UOR-Foundation/PrismPM/issues/647), D9, tracks SDK adoption
   of the repaired Lean. Foundry must consume a qualified immutable image through the SDK-owned path,
   not patch the image locally or substitute a host Lean.
3. [LexLean PR 498](https://github.com/UOR-Foundation/LexLean/pull/498) owns shard toolchain-address
   binding. It explicitly does not change published attestations. It does not supply this gateway contract.
4. The `lexlean-mcp` owner must expose the current identity and bind attestations to their original
   identity and revocation epoch. Consumer mocks do not establish that service capability.
5. Foundry then qualifies the exact new SDK and gateway, runs the upstream malformed-term negative
   control in both prescribed checking paths, performs new full proofs, and demonstrates that old
   records cannot survive toolchain/epoch replacement. No release is declared repaired before that.

## Verification of this candidate

- `node --test studio/tools/proof_reuse.test.mjs`: 16 tests, 16 pass, no skips.
- The Rust conformance wrapper requires the exact TAP test/pass counts and zero failures, cancellations,
  skips and todo results. The wrapper itself has not been executed in this environment.
- Final `node --test studio/tools/*.test.mjs`: 600 tests, 597 pass, zero fail, three existing
  opt-in hosted checks skipped (19.1 seconds).
- Read-only review found a final-attestation epoch race. The descriptor read was moved after evidence
  retrieval and a regression added. This is client-side admission hardening, not SDK qualification.
- `git diff --check` passes.

Planted defects use the actual production module, run the full proof-reuse suite, then restore and
compare the file bytes. All seven listed defects exited 1, and the restored suite passed 16/16:

| Plant | Expected rejecting control |
| --- | --- |
| Remove missing-trust admission refusal | Direct malformed-current-identity admission |
| Allow the retired Lean digests | Retired SDK executable control |
| Omit toolchain addresses from keys | Direct address-change assertions |
| Accept bare `found` | Exact attestation/coverage/status/trust controls |
| Ignore stored policy epoch/trust | Legacy and forged-policy records |
| Skip final mixed-proof epoch check | Mid-proof and final-attestation rotation controls |
| Skip all-reused epoch check | Rotation while admitting cached records |

The first mutation run missed omission of toolchain bytes from the key and the direct missing-trust
check because other layers refused reuse. Direct address and typed-refusal assertions were added;
these are gate-quality corrections, not evidence that the surviving mutants authorized reuse.

**Not run:** `just model-write`, the Rust wrapper, and full `just vv` inside the exact SDK. This executor
has Node but no Cargo, Just, Docker, PrismPM or Lean. `model/ids.toml`, authorities and ledger are
unchanged, so `CONFORMANCE.md` is expected to remain byte-identical, but the owning writer still needs
to be run in the SDK. CI must qualify the final candidate. No host substitution is a release pass.
