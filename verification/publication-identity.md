# Publication identity evidence

FA-05 implements `FoundrySpecification.publicationIdentityBoundary` and its four
`PublicationIdentityError` constructors. Registration, scenario and failing test
preceded implementation. The browser adapter compares the complete canonical page
build identity with the fingerprint independently recomputed by the imported
Prism archive reader. Suffix matching and implicit string coercion are removed.

The current template copies `holo-identities.json.archive_fingerprint` directly
into `app.json.attestations.build.id`. Prism's v4 archive reader computes BLAKE3
of the bytes before the 32-byte footer, returning 64 lowercase hexadecimal digits.
The accepted receipt records this exact profile: `archiveFingerprint`, `blake3`,
`holo-v4-body`, version 1. It is not the whole-archive digest and does not silently
accept another algorithm prefix. A future profile requires explicit admission.

A publication result also requires a positive safe-integer vector total, a valid
passed count, a failed array accounting for every remaining vector, and no failed
vectors. Malformed identity, unequal identity, malformed/empty acceptance and
failed acceptance are separate typed refusals.

## Executed controls

Eight Node tests execute the shipped admission adapter, including four cases
through the actual GitHub publication module with deterministic network and archive
reader fixtures. They cover successful typed receipts, prefixes/suffixes, casing,
newline bytes, missing identities, coercible objects, unequal digests, malformed
reports, inconsistent counts, empty reports and failed vectors. These fixtures
exercise orchestration; they do not constitute live-deployment or hashing evidence.

Restoring suffix comparison caused one test failure. Allowing a zero-vector report
caused two failures, including the actual build path. Both defects were restored.
All 39 Rust workspace tests passed, including 30 Node controls across FA-03 through
FA-05. Browser parse-goal checks passed. Full locked-SDK acceptance remains the
unmodified PR CI gate.

## Completeness review

Author review checked both identity comparisons in retrieval and final admission,
all four refusal codes, canonical profile semantics against the imported reader
and template producer, non-vacuous vector accounting, and the host's existing
error-display path. This self-review is not independent approval. The reader still
owns archive parsing and fingerprint recomputation; this adapter does not copy it.

Matching a page and archive establishes their agreement, not authenticated publisher
provenance or a source-commit-to-artifact binding. Those release obligations remain
open and must not be inferred from this receipt. Full live replay, ownership
receipts and factory-based release qualification remain separate acceptance work.
