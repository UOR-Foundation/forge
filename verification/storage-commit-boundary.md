# Storage transaction acknowledgement

Authority: `FoundrySpecification.storageCommitBoundary` and
`StorageRequestError`. FA-20 changes the shared host `tx` helper so a successful
IndexedDB request is acknowledged only after its containing transaction commits.
Previously it resolved directly in `request.onsuccess`; a later transaction abort
could therefore be reported as success. All existing host calls through `get`,
`put`, `del`, `all` and `keys` now use the checked adapter.

The adapter captures the request result, waits for `transaction.oncomplete`, and
refuses on abort/error or missing request success. Synchronous operation failures,
invalid request objects, request errors and failing result access abort queued
writes. Failures carry `storageTransactionFailed` and a fixed message with no
exception or stored data. The existing IPC boundary maps these to `handlerFailed`.
Undefined results, including deletion, remain valid after completion.

The registered ID, scenario and failing test preceded implementation. Ten Node
controls exercise completion ordering, late abort, request/transaction failure,
queued-write abort, invalid requests, failed result access, deletion, the actual
host helper and canonical declaration. Chromium exercises real IndexedDB request
success followed by abort, verifies rollback, checks synchronous failure rollback,
then commits, closes and reopens a database to verify recovery and deletion.

Mutation: resolving inside request success reproduces the previous defect. Both
`node --test studio/tools/storage_request.test.mjs` and
`node studio/tools/storage_request_browser.mjs` fail; Chromium reports
`request success was reported as commit`. Restoring the adapter passes all ten
controls and the complete browser run. Full workspace tests, Clippy, shell parser
and imported contract checks pass locally. Studio CI includes the real browser
check, and Rust conformance requires all ten tests without skips or omissions.

This is transaction acknowledgement, not atomicity across separate transactions,
permission enforcement, guaranteed quota, cross-device persistence or durability
beyond the browser's IndexedDB contract. Creation and other multi-write journeys
still require their own atomicity and recovery boundaries. Full immutable-SDK and
Studio acceptance are recorded at the PR revision; host diagnostic compilation is
not a substitute.
