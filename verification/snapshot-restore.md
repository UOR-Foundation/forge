# Snapshot reconstruction acceptance

FA-08 realizes `FoundrySpecification.snapshotRestoreBoundary` and the typed
`SnapshotRestoreError` boundary in `app/src/FoundrySpecification.lex.tex`.
Registration, scenario and a failing Rust test preceded implementation.

Previously, restore verified only the snapshot address, deleted working files,
skipped missing referenced objects, and advanced the reference. A damaged object
store could therefore turn a restore into silent data loss. The browser adapter
now verifies the complete immediate file closure before opening one IndexedDB
transaction for files, the main reference and invalidation of cached rule/proof state. The existing generated core still
admits the snapshot address. Both checkout and revert use this adapter.

The boundary checks canonical addresses, exact snapshot shape, unique portable
paths, all file lengths and identities, fixed resource limits, and exact UTF-8
round trips including BOM preservation. Empty snapshots are valid. It exposes
modeled refusal codes without including object contents in errors; the public
IPC boundary maps handler exceptions to its existing typed handlerFailed error.

Nine Node controls run inside the Rust conformance gate. Chromium executes the
shipped module against real IndexedDB: missing file objects preserve state;
an injected reference-write failure after file mutations rolls back the whole
transaction; success replaces files and the reference together; other projects
remain intact; and an empty snapshot clears only the selected project. The
browser test is also a required Studio CI step using the renderer's locked
Playwright dependency and the runner browser.

Mutation evidence: replacing the missing-file refusal with silent omission
fails the Node suite. Replacing transaction abort with success fails the real
browser rollback check. Restoring both changes makes both suites pass.
Local Rust workspace tests, Clippy and shell parsing also pass. Remote locked-SDK
acceptance is required separately; host diagnostic compilation is not that gate.

Author completeness review checked both restore entrypoints, pre-write closure
validation, exact text reconstruction, failure privacy, transaction rollback,
other-project isolation and CI reachability. This is an author review, not an
independent approval. The feature reconstructs stored text snapshots; it does
not establish parent-history closure, compression optimality, concurrent-edit
merging or whole-application release acceptance.

Completeness review also found cached proof status surviving checkout. A browser
regression failed with `stale proof cache survived restore` before the adapter
was changed. Successful restore now removes only this project's cached rules
in the same transaction; abort preserves that cache and other projects' proof
state is untouched. In-flight publication and broader edit/proof concurrency
remain separate lifecycle obligations.
