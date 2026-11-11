# FA-52 — Canonical version history

Authority: `FoundrySpecification.versionHistoryBoundary`, composed with the existing snapshot-restore identity and compiled-core admission boundary. Canonical stored identities remain `blake3:<64 hex>`; renderer-facing version IDs are their reversible 64-character hexadecimal representation. They are not Git commit identities.

The imported metadata controls send `versionId` and receive `{oid, isFavorite, note}`. One apps-and-versions transaction validates existence, reads current metadata, applies the requested field, and acknowledges only on commit. Parallel note and favorite updates retain both changes. Notes follow the imported 10000 UTF-16-code-unit limit. Listing `main` returns history; an exact known version selects that record without claiming branch ancestry traversal.

Version differences validate the requested project-owned snapshot, every file identity, compiled-core admission, and the parent snapshot/file bytes. The validated parent comes from the same captured snapshot bytes. Missing, corrupt or refused input cannot be replaced with an empty successful diff. Restore accepts the same reversible renderer alias while retaining canonical snapshot admission.

## Evidence

The FA-52 ID, scenario and missing-test failure preceded implementation (`canonical-version-history-red.log` in the execution evidence workspace). Six Node controls cover reversible aliases, malformed and missing identities, imported metadata shapes, concurrent field preservation, transaction completion and late abort, deleted projects, invalid stored records, complete added/changed/deleted text, parent identity, file corruption and core refusal. The entire 314-test local Node suite passes.

`node studio/tools/canonical_version_history_browser.mjs` passes against the actual host, imported bridge contracts, compiled core and IndexedDB. It creates three versions, applies concurrent favorite/note changes, verifies exact historical text, refuses oversized notes and unknown versions, aborts an actual transaction after request success, refuses a corrupted stored object, reloads retained metadata, and refuses resurrection after project deletion. No page exceptions occurred. The Studio lane requires this browser gate.

Seven planted defects were rejected: wrong alias conversion; missing app-existence check; success before transaction completion; relaxed note bound; discarded verified parent; omitted file-identity check; omitted core admission. Each was restored and all six controls passed. Diagnostic logs are `version-history-mutation-*.log` in the execution evidence workspace.

The specification's two-module host diagnostic produced receipt `ece2df30b2fab6fcd8af888345231f970417dd7260b80672f572b84414054b28`. It is not locked-SDK acceptance. Local Rust acceptance is recorded separately after clearing reproducible build caches needed by the linker.

## Acceptance scope

This feature does not complete version-preview window ownership, checkout/return/revert actor semantics, branch management or restore-to-message. Those remain separate conversion obligations. The feature stack still requires the new signed guest, full locked-SDK `just vv`, full Studio acceptance and independent review before release. Local browser provenance is explicitly diagnostic and is not committed as release evidence.
