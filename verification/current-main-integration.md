# Current main integration (FA-24)

Authority: `app/src/FoundrySpecification.lex.tex`,
`currentMainIntegrationBoundary`; lifecycle claims FK-10/FK-11 remain in
`ForgeKernel.lex.tex` and `ForgeKernelProofs.lex.tex`.

This integration preserves main's live editor, renderer, mobile layout and
verification gates alongside the conversion's composition, work, typed host,
source binding and atomic storage boundaries. Live edits and agent patches use
one captured source per batch, commit once, and carry the resulting source.
A storage refusal invalidates optimistic editor history and refreshes committed
state. Wording changes retain a proof only after matching both the candidate
and prior checked logic with the stored identity. Proof completion uses the
latest matching state as its compare-and-set predecessor. The semantic
published phase may survive rewording, but the card marks the publication stale
until a successful new publication.

The registered six-control gate initially failed because it did not exist.
After implementing the host integration, five host controls passed and the
sixth rejected the inherited 109-vector guest: the integrated guest must replay
at least 114 vectors, including reword, and retain composition and work.
The stale guest is not a qualified integration result. Build provenance,
mutation results and full immutable SDK evidence will be recorded before this
feature is marked ready.

The host tests execute extracted production functions with controlled effects;
they do not claim end-to-end provider or renderer qualification. The existing
real IndexedDB generation browser controls remain active. No factory consumer
or full application conversion claim follows from this integration.

## Signed artifact and restored acceptance

Build 43032488774 exposed the locked SDK snapshot JSON recursion limit when the
flat acceptance list grew from 109 to 114. Four closed list aliases bound the
AST depth; no vector, public bound or proof was removed. Build 43033504480 at
`686c09b89757fa3a924dd71bd17e53dd43509a73` passed. Its signed archive fingerprint is
`4e9d80d52a73916bcdf9163902b31a520e4e42eaad227b087fda0e1a7c5e7cac`,
whole-file SHA256
`c1da2933403ff457fded52a6a21a3d9c4d5164783b2881bd63a0d5570f3ab9da`.
GitHub CLI verified exact source and signer workflow with self-hosted runners
refused; wrong-source and changed-byte controls failed. The receipt is
`kernel-artifact-receipt.json`, with the build record and Sigstore bundle beside it.
The archive is pinned through an immutable archive-only commit in KERNEL_REV.

The actual installed guest passes 114 embedded vectors, 26 composition cases,
30 work cases and all five reword phases in document and dedicated-worker
contexts. The new test's initially guessed refusal labels were corrected to the
existing corpus's exact `malformedComposition` and `invalidWorkRequest`; those
public errors were not changed. All 137 Node controls and the full local Rust
workspace pass, as do Clippy, source parser, renderer input/output contracts,
real storage generation controls, current main's live preview/table/edit gates,
the 66-file component rebuild, build appearance and renderer typecheck.

Four planted host defects fail the six-control gate: removing prior-logic
recomputation, omitting module identity from the proof key, dropping preview
source comparison, and retaining optimistic history after a failed write.
The restored gate passes. A module rename must not reuse an attestation naming
the old module even when the decision table is identical. The live trust badge
also compares exact displayed source and does not label changed publication
bytes as currently published.

Diagnostic twelve-module verification of the aliased source passed with
attestation `fc38bf351c4a7ffd4e1e5a1aa1e5be6662fb115bc35c8f5f28596a2bffbf015a`.
This is supplementary host evidence. Full feature SDK/Studio CI and the newly
requested independent build remain pending at this revision.

## Maintainer race repair

The invalid-live-edit redraw previously copied the semantic phase directly.
After publish and a wording change this could label unpublished bytes
published; a source mismatch could likewise borrow unrelated trust. The redraw
now uses the existing exact-source/publication-current refresh path.

Rules checking previously captured a lifecycle predecessor, committed source
while deleting status, then installed that stale predecessor in a separate
transaction. A proof completing before the commit was lost; completion during
the missing-status interval was dropped. Rules batches now compare the exact
raw predecessor and atomically write source and status. A stale reword refuses
with projectEditConflict, preserving both the completed proof and old source.
Status-only batches perform the same comparison without adding a source version.
Proof completion retries its settled result after a matching reword CAS race,
only while the predecessor changes and semantics still match. An unchanged
predecessor stops retries; continual matching edits can delay completion.

Local evidence: 161 Node controls pass, including production transaction
callbacks under a deterministic scheduler and exact extracted host functions.
The installed signed kernel identity and 114 embedded vectors remain covered.
The real IndexedDB generation gate adds deterministic proof-before-commit and
proof-after-commit interleavings, including observing source-bound status at
the commit callback. These browser controls are added but not locally executed:
the environment cannot launch Chromium. Full browser and immutable SDK
acceptance remains pending CI for the repaired commit; historical results above
do not qualify these new changes.


Four representative mutations were each rejected, then restored:
- Replacing refusal refresh with raw semantic phase redraw fails the invalid
  live edit trust control (published instead of proved/draft).
- Omitting lifecycle predecessor comparison fails the pre-commit proof control
  (expected projectEditConflict and unchanged storage).
- Deleting status rather than installing it atomically fails the status-gap
  control (missing current status).
- Disabling retries after the first failed completion CAS fails the reword
  completion control (completed proof lost).

Commands: node --test studio/tools/current_main_integration.test.mjs and
node --test studio/tools/rules_transaction.test.mjs. The restored combined
12-control gate passes and is wired into the exact-count Rust FA-24 gate.
Shell source parsing passes. model-write and full just vv could not run locally
because cargo, just and prismpm are unavailable; generated evidence was not
hand-edited to substitute for that gate.
