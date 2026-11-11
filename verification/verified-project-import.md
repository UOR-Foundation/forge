# Verified project import (FA-28)

Authority: `app/src/FoundrySpecification.lex.tex::projectImportBoundary`.
The registered ID and scenario preceded a failing Rust gate for the missing Node
oracle. Import preparation now copies validated primitives, verifies every
supplied object and the complete referenced snapshot ancestry, and checks current
name/files against the main snapshot before any storage mutation. Missing,
corrupt, mismatched, cyclic or oversized data refuses the complete import.

The existing export profile is retained. Unsealed exports acquire a generated
initial snapshot. Name collisions create a generated child snapshot, keeping the
project name and reference coherent; a suffix exceeding the 255-character name
bound refuses. Direct dependency metadata must agree with the source declaration.
Imported permissions, keys, provider selections, cached proofs and cross-app
references cannot grant authority. Fixed typed failures cover invalid input,
limits, identity, missing objects, source disagreement, history, timeout and
cancellation. Existing snapshot, core and preparation errors retain their types.
The 120-second preparation deadline bounds asynchronous work and checks elapsed
time between synchronous steps; it does not terminate already executing code.

The host commits only prepared records using its existing single transaction,
insert-only app/chat writes and persistent allocation guards. Six Node controls
cover input copying, authority exclusion, valid closure, current/history failures,
name collision snapshots, dependency binding, byte bounds, deadline/cancellation,
identity failures and actual host/parser wiring. Real Chromium executes the actual
host import handler against IndexedDB: valid closure and authority exclusion,
collision rename, three pre-write refusals, injected late-write rollback and
recovery all pass. The separate creation browser gate continues to force a legacy
ID collision with zero high-water marks, preserving its insert-only oracle.

Five planted defects were rejected: retaining arbitrary app fields, skipping
supplied-object identity comparison, skipping current-source agreement, returning
the wrong deadline error, and failing to abort after a late storage exception.
The first four failed `node --test studio/tools/verified_project_import.test.mjs`;
the fifth failed `node studio/tools/verified_project_import_browser.mjs` with
`partial import survived abort`. All were restored and rerun successfully.

All 161 Node tests, full local Rust workspace, Clippy, parser, renderer boundaries
and contract projections pass. Supplementary diagnostic verification checks all
12 model modules (attestation
`f15a31e880f8d50d054ef87cae4750859c4a2484941dff0cffb10654fcd3d80b`).
Full immutable-SDK and Studio acceptance are pending at this initial revision.
Adapter fixtures use an independent preimage oracle, not evidence that they
execute the generated core. Import integrity does not establish export
provenance, publisher authenticity or completion of the application conversion.
