# Atomic project lifecycle (FA-25)

Authority: `app/src/FoundrySpecification.lex.tex::projectLifecycleBoundary`.
The registered scenario and Rust gate preceded the implementation. The first
command used the wrong package name and was corrected to `repo-conformance`;
the actual red result was the missing six-control Node test file.

Rename now seals the new name, current parent and existing files in the same
compare-and-commit transaction as app metadata and history. Checkout validates
snapshot/file identities, restores exact target reference, name and direct
dependency metadata, and clears proof status without adding a version. Revert
prepares one child of the previously current reference with target contents.
Deletion removes the app, files, references, versions and dependent chats in
one transaction; shared objects remain. Allocation marks survive deletion and
cover legacy IDs. Imports compare their proposed allocation with these marks
inside the commit. Late chat updates require both the chat and app and cannot
resurrect a deleted record.

Six Node controls cover dependency decoding, invalid requests, private errors
and host delegation. `node studio/tools/project_lifecycle_browser.mjs` executes
production adapters with real Chromium IndexedDB and an independent snapshot
preimage fixture. It checks exact checkout, rename identity, revert parentage,
dependency restoration/clearing, four source races, three late storage failures,
deletion isolation, stale chat updates and ID nonreuse including legacy rows.
It runs in Studio CI. Existing creation, edit and generation browser controls
also pass. The old restoration host test was updated to the new adapter and
signature while retaining core-admission and no-direct-write checks.

Four planted defects are rejected by the lifecycle browser gate:

- Removing reference comparison initially survived because all original races
  also changed files. An independent reference-only race was added; it now
  rejects that defect without changing the other oracles.
- Removing transaction abort leaves deletion writes behind and fails rollback.
- Ignoring persisted allocation marks reuses deleted IDs and fails nonreuse.
- Omitting restored dependencies leaves metadata inconsistent with snapshot bytes.

All mutations were restored and the complete browser gate passed afterward.
Creation's insert-only import control explicitly exercises legacy zero marks so
that a high-water refusal cannot mask an accidental overwrite implementation.
Host dependency metadata is still direct requests, not a transitive package lock.
This is browser-local consistency; shared-object collection, authenticated
ownership, cross-device identity and whole-product qualification are separate.

Full immutable SDK/Studio acceptance and the combined signed guest remain pending
at this feature's initial draft revision. Diagnostic host verification is not a
substitute for those gates.

## Integrated guest and CI correction

The combined parent guest is installed. All 143 Node controls and the full local
Rust workspace passed after merging it; page/worker replay and lifecycle and
generation browser controls passed again. Twelve-module diagnostic verification
passed with attestation
`d30f727e5dea64af12ac8a28b7ea83e31ea78f799ca636330f6d63d3330c65bc`.

Studio run 43035754353 passed the lane, contract and all storage controls, then
refused the new module because its explicit module parse goal was missing.
The earlier local parser log had the same failure, so the initial PR statement
that parser checks passed was incorrect. `project-lifecycle.mjs` is now explicitly
registered and the six-control gate binds that entry. Parser and contract gates
are rerun below this correction; full feature CI must pass at the corrected head.
