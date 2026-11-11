# Browser composition boundary

FA-10 implements `FoundrySpecification.compositionHostBoundary` and its typed
`KernelBoundaryError` vocabulary. `forge:compose` accepts exactly policy and
features, serializes them with `CompositionProtocol`, and delegates admission to
the pinned generated guest. No browser implementation decides semantic validity.

The loader rejects malformed metadata, unavailable resources, changed guest
bytes, an impure or incorrect ABI, and failing acceptance before exposing the
guest. Public dispatch checks and copies input, uses a fresh instance, and bounds
output before copying it. Text requests use the same dispatch. Public request
limits and acceptance allocation limits remain distinct.

Registration and a failing Rust test preceded implementation. Seven Node tests
execute the actual loader and committed Wasm, including the actual host handler
extracted from `host.js`. The old guest fails the composition case. Chromium
additionally executes the shipped classic loader in a document and a dedicated
worker, replaying the complete wire corpus in both. Oversized public requests
must produce the loader's typed refusal; the embedded allocation-boundary vector
still executes during acceptance replay. The worker test checks classic-script
compatibility; it does not establish complete service-worker journey acceptance.

The repository kernel gate binds metadata and guest bytes to `KERNEL_REV` and the
archive. Runtime SHA256 checking alone does not authenticate an arbitrary origin.
Model declaration admission does not authenticate a feature registry or its
evidence. Intent routing, domain projections, UI creation, physical budget
measurement and whole-application release qualification remain distinct
specification obligations.

Artifact qualification and mutation receipts are recorded below only after their
checks complete. This feature remains unaccepted until its actual SDK-built guest
passes the complete boundary and browser suites.

## Qualified guest and local boundary acceptance

Build 43007577514 produced the exact source revision
`775fa3a16852b6e76b287f7a9f3807843f5fcc43`. The build record, Sigstore bundle and
review receipt are committed beside this evidence. GitHub CLI 2.103.3 verified
the bundle against the official Sigstore public root pinned in the receipt,
requiring this repository, this workflow, this source digest and hosted runners.
Wrong-source and changed-archive-byte controls both refused. This authenticates
that build's subject; it is separate from runtime acceptance.

Independent reader replay passed 79/79 embedded vectors, all 26 wire vectors,
and the maximum-payload refusal. The 12,908-byte guest is extracted byte-for-byte
from that archive, with an immutable committed archive URL in `KERNEL_REV`.
All seven actual loader/host tests now pass. Chromium independently passed all
26 cases and 79 embedded vectors in both a document and a dedicated worker.
Removing integrity comparison, removing expected-response comparison during
replay, or bypassing the request copy each fails the full seven-test suite.
Mutations were restored; the complete local Rust workspace tests, Clippy and
kernel archive-consistency check pass. Final locked-SDK/Studio acceptance of the
host feature revision remains required.
