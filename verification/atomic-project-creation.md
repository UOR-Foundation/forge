# Atomic project creation

Authority: `FoundrySpecification.projectCreationBoundary` and
`ProjectCreationError`. FA-21 replaces the browser's separate app/file/version/chat
writes with preparation followed by one transaction across apps, chats, files,
objects, refs and versions. The existing generated core still owns canonical
snapshot bytes. Preparation copies inputs before hashing, preserves exact UTF8
files and derives identities through the existing BLAKE3 boundary.

App and chat identifiers are allocated from current keys inside the write
transaction. Concurrent creations serialize there, including chat-only creation,
which requires an existing app. Import now uses insert-only app/chat writes;
a concurrently allocated ID causes refusal and rollback instead of overwriting
an existing record. Synchronous import write errors also abort queued writes.

Scaffold loading requires every manifest file and AI_RULES.md, refuses missing
resources, redirects, malformed/duplicate/escaping paths and invalid UTF8, and
caches only complete results. It has one 30-second header/body deadline, a 64 KiB
manifest, at most 1000 files, 16 MiB per file and 64 MiB overall. Preparation
checks those file bounds again and limits the generated snapshot to 1 MiB.
Typed scaffold, preparation and storage failures expose only fixed messages.

The ID, scenario and failing test preceded implementation. Eight Node controls
cover exact file/identity preparation, caller mutation, invalid paths/encoding,
resource bounds, broken identity/core dependencies, complete scaffold retrieval,
stalled headers/bodies and the actual host delegation. Chromium runs concurrent
creation and chat transactions, verifies complete file/object/reference/version/
initial-chat closure, injects a write failure after prior writes are queued,
checks rollback and ID reuse, refuses a chat for a missing app, and executes the
actual imported host handler with colliding IDs. This browser harness uses an
independent preimage oracle to scope its result to adapter/storage behavior; it
does not requalify the generated core's preimage semantics.

Removing the explicit abort after a synchronous write failure fails Chromium
with `partial project survived aborted transaction`. Changing import app/chat
insertion back to overwrite fails with `import replaced an existing project`.
Both defects were restored; all eight Node controls and browser cases pass.
Full Rust workspace, Clippy, parser and imported contract checks pass locally.
The diagnostic compiler verifies twelve modules with attestation
`cb33e686b7c3e37bd6384232e3436bb9c638dffb3188c997d72f9f0f4656611d`.
Full immutable-SDK and Studio gates remain required at the feature revision.

This establishes local creation atomicity, not authenticated scaffold provenance,
global project identity, later edit atomicity, complete import closure,
guaranteed browser durability or complete application generation. The scaffold
is fetched from the shell's configured origin and receives no new trust claim.
