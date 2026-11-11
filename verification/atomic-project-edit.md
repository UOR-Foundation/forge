# Atomic source-bound file edits

Authority: `FoundrySpecification.projectEditBoundary` and `ProjectEditError`.
FA-22 changes the explicit `edit-app-file` host command. It captures name, files
and main reference in one read transaction, prepares generated snapshot bytes
outside storage, and compares the entire capture inside its write transaction.
The captured reference becomes the new snapshot's parent. Changed/added/removed
files, changed reference or renamed app refuse without silently retrying.

The edited file, all prepared objects, reference, version and app update commit
in one transaction. Existing version metadata is read there and preserved.
Changing `prism/spec.json` clears cached rule status in that transaction. Other
file edits retain only the existing rule-source-specific claim; no whole-app
proof claim is created. Synchronous errors abort queued writes.

Typed errors are invalidProjectEdit, projectEditConflict, projectEditStateInvalid
and projectEditStorageFailed. Preparation reuses projectPreparationFailed. Public
messages are fixed, and IPC maps failures to handlerFailed. The input copy and
creation preparation bounds apply before any write transaction.

The ID, scenario and failing test preceded implementation. Five Node controls
cover exact generated parent delegation, invalid parent/input refusal before
effects, actual host delegation and typed/parser declarations. Real Chromium
checks exact snapshot identity and parent, rule-cache invalidation, five source
race classes, two concurrent edits with exactly one accepted commit, late write
rollback, preserved version history and recovery. The browser's independent
preimage oracle qualifies the adapter/storage, not the core's own semantics.
Creation's Chromium checks also pass after sharing its preparation function.

Mutations and observed browser failures:

- Removing file-content comparison: `changed source race accepted or modified state`.
- Removing rule-cache deletion: `stale rule state survived`.
- Removing explicit transaction abort: `failed edit left partial writes`.

All mutations were restored; the five Node controls and browser checks pass.
Full workspace tests, Clippy, parser and imported contracts pass locally. The
diagnostic compiler verifies twelve modules with attestation
`0d334a5935aa6f14767631072ab1bd9a2de66837bbe8334481138b6ce60aa25b`.
Full immutable-SDK and Studio gates remain required at the feature revision.

This boundary covers explicit file edits. Streamed generation, app deletion,
renaming and other mutation paths still need separate qualification. Comparison
binds current bytes and reference, not intervening history that returned to an
identical state. Browser durability, authentication and whole-product acceptance
are not established here.

Removing the obsolete file-sealing wrapper exposed three test harnesses that
used its comment as the dispatch-extraction delimiter. They now extract the
actual dispatch function through its closing brace. The failed full Rust run
was retained as a regression, and the complete suite was rerun after this fix.
