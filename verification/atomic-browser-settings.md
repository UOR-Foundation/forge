# FA-63 — Atomic browser settings

Authority: `FoundrySpecification.browserSettingsTransactionBoundary`. The registered failing Rust gate and actual-browser failure (two disjoint concurrent preference changes lose the first value) precede implementation.

The previous host read the settings record and wrote its patch in separate transactions. A concurrent change could overwrite an unrelated preference or resurrect a credential after removal. Renderer patches, provider-key updates, selected-model changes and full replacements now use a single read-write IndexedDB transaction. Caller inputs are copied before database readiness; the update runs synchronously between the read and write. Both reads and writes settle only on transaction completion. Invalid input, corrupt root records and storage failures retain distinct fixed typed errors. The imported renderer contracts and telemetry refusal remain in force.

Six focused controls pass. Six planted defects are rejected: missing capture, readonly mutation mode, request-level acknowledgement, missing stored-root validation, successful acknowledgement on abort and restoration of the old split host read/write (rejected by the actual browser). Restoring the implementation passes those controls, the atomic settings browser journey and the original provider-credential browser journey.

Actual Chromium covers same-window and two-window contention, repeated credential removal against overlapping patches, reload, and a real IndexedDB request-success-then-abort. Both preferences survive, removed credentials stay removed, the aborted write leaves durable bytes unchanged and no page exceptions occur. The telemetry isolation fixture now injects the new storage ports while retaining its original refusal-before-write assertions; transaction semantics are independently tested in the real database.

All 380 Node controls pass. The two-module host diagnostic verifies at `dfb79be78f4067e95f6b8aed2be25132b1faeee2c2cb0d7d7a5ca7caaccff979`. It is not exact-SDK acceptance. The full browser sweep, workspace checks, exact CI and independent review are recorded separately; the existing cold-load performance hold is unchanged.
