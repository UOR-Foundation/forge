# Durable portable build work

Authority: `FoundrySpecification.durableBuildWorkBoundary` (FA-46) and
`WorkOwnership.boundary`, executed through the signed WorkProtocol guest.

The actual portable builder acquires an exclusive same-origin Web Lock, mints
its owner internally, and commits guest-admitted reservation and running state
before entering the permission/build operation. The renderer cannot choose the
owner through a command. This cooperative browser ownership does not authenticate
remote users or defend against arbitrary malicious same-origin scripts.

One semantic unit is one completed portable artifact. Attempt count and elapsed
build time are separate observations; failed network attempts are not counted
as achieved semantic work. Failure retains the reservation and remaining unit.
A new owner can pause an interrupted running record, transfer and resume through
the guest. Re-execution enters the normal source-bound permission dialog. It
cannot undo earlier remote effects or resume arbitrary compiler stages.

The journal binds source and shell closure. Completion commits guest progress,
finish and the captured output atomically. Output is bounded to 16 MiB of its
serialized representation. Reuse verifies its content identity and current
source, then returns a clone without repeating network work. At most 32 distinct
source/environment records are retained per project; exhaustion explicitly
refuses. Project deletion removes the journal in its transaction.

## Evidence

Registration and a missing-test failure preceded implementation. Six Node
controls use the actual verified guest for reservation, execution, interruption,
owner transfer, completion and reuse. Independent in-memory storage/lock fixtures
exercise the adapter contract; their digest fixture is explicitly diagnostic.
The browser instead uses the real IndexedDB store, Web Locks, content derivation,
locked compiler, service worker and guest. Deterministic CDN transport fixtures
supply an executable application; they do not establish production CDN trust.

The actual journey covers denial retaining work, a competing tab refusing,
completion, reload reuse without network, corrupted artifact refusal, a closed
tab leaving running work, fresh-owner recovery with renewed approval, a forced
storage comparison race, late transaction abort and atomic deletion. No page
exceptions occur. The existing portable-permission journey starts a new source
before testing offline effects, because completed work can now be reused offline.

Seven planted defects are rejected: absent reservation, concurrent ownership,
artifact-identity bypass, source-check bypass, absent completion, absent storage
comparison and omitted deletion cleanup. The first reservation mutation exposed
an unbounded test wait; the wait now fails explicitly when execution never
starts, and the complete mutation run passes without intervention. Sources and
local projections are restored after each candidate.

Diagnostic LexLean verification of two modules passes with receipt
`7c430ae80472dc27ff39fc8e2407c8dae1aa8224913b86c4620f01fcbad3838f`.
The complete local suite has 278 Node controls. Full local Rust/Clippy, shell
parsing and actual browser regressions are required alongside exact-head SDK
and Studio CI. Diagnostic verification does not replace that complete gate.

This establishes durable ownership and achieved-artifact checkpoints for portable
builds. It does not establish remote authenticated work ownership, all-effect
recovery, intermediate compiler checkpointing or complete application release.
