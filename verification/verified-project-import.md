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

## Maintainer resource and identifier repair

The FA-28 authority and scenario were strengthened before adding two failing
regressions. Before the repair, seventeen distinct snapshots sharing one 8 MiB
file were accepted despite repeated decoding exceeding 128 MiB; a chat containing
message IDs `9007199254740991` and `0` also retained those IDs. The next local
user/assistant allocation could therefore collide through floating-point overflow.

Import now separately charges every snapshot-body and file-object read against a
128 MiB cumulative materialization budget before copying, hashing or decoding.
Repeated references in distinct snapshots consume that budget even when storage
objects are deduplicated. Cached validated snapshots do not decode again. Exceeding
the budget produces `projectImportLimitExceeded` before returning prepared data;
the existing host transaction remains unchanged. This bounds cumulative content
materialization, not process heap or browser overhead to exactly 128 MiB.
Validated message IDs are renumbered from one within each chat, preserving message
order/content and retaining rejection of duplicate or malformed original IDs.

The two new regressions first failed with `Missing expected rejection` and the
original IDs instead of `[1, 2]`. After repair all eight focused controls pass.
The history regression also checks that the over-budget file is refused before
its identity derivation, rather than after allocating another decoded string.
Two planted defects were independently rejected by the complete focused command
`node --test studio/tools/verified_project_import.test.mjs`:

- Replacing `materializedBytes += bytes.length` with `materializedBytes += 0`
  failed the cumulative history regression with `Missing expected rejection`.
- Restoring `id: m.id` instead of `id: index + 1` failed the message-ID regression
  with the original IDs instead of `[1, 2]`.

Both mutations were restored; the complete focused suite passed again. All 193
Node tests and the shell parser pass on the integrated compiler/editor stack plus
main's lifecycle race fixes. These are adapter controls using an independent core
fixture, not generated-core qualification.

This repair environment has no Cargo, Rustup or Just executable. `model-write`,
Rust/Clippy and full immutable-SDK `just vv` were not rerun locally. Inspection of
`xtask::check_model` and `codegen::render_conformance` shows CONFORMANCE derives
from the unchanged model register, so that generated file was not hand-edited.
Remote acceptance must still validate exact model projections and the complete
immutable-SDK gate. Browser replay remains blocked by the environment's socket
restriction; earlier browser results above are historical, not a new pass for
this repair. No browser bypass or substitute SDK was used.
