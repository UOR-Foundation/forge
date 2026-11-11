# Typed event admission

Authority: `EventAdmission.admitEvent`, `eventAdmissionBoundary` and
`FeatureComposition.admitComposition`. FA-19 exports a pure compiled library
operation. It rechecks current composition policy on every admission, then binds
the envelope to an exact event key/version, declared producer/consumer feature
versions, independently expected generation and sequence, and bounded payload.
All routed features must declare the event key. Event routes are independent of
composition dependencies, so feedback need not introduce a dependency cycle.

Payload variants are uint32 naturals (four bytes), flags (one byte) and arrays of
0..255 bytes. The event contract selects one variant and a positive maximum at
most 65536 bytes. Wrong variants, out-of-range values and oversized payloads fail.
Sequence exhaustion refuses before uint32 increment. The result is the next
sequence, without mutating state or delivering an event.

Public failures are invalidEventContract, invalidEventContext, staleGeneration,
staleSequence, wrongEvent, undeclaredRoute, invalidPayload and compositionRejected
carrying the original CompositionError. Twenty-four finite closed Lean controls
cover all these categories, successful variants, the last usable sequence,
revoked grants, missing/duplicate routes, undeclared feature events, wrong
versions, replay and future sequence numbers. The ID, scenario and failing Rust
source-control test preceded implementation. Full workspace tests and Clippy
pass locally. Source controls pin the exported operation, composition delegation,
proof names, exact closed proofs and typed result categories.

These declarations do not authenticate participants or policy, atomically persist
the returned sequence, establish delivery or exactly-once effects, or qualify
privacy, elapsed-time bounds or complete application journeys. A runtime must
bind authenticated state and policy revisions to actual execution. The browser
has no event protocol or handwritten semantic fallback in this feature.

Diagnostic compiler verification and mutation results are recorded below. The
full immutable-SDK gate at the PR revision remains the acceptance boundary;
host diagnostics do not replace it.

The diagnostic compiler verified all twelve modules with attestation
`94e87930ee29333a8b3dd0c92968b522a0252eef0a8d699e13a6f303cf1415b3`.
Replacing the envelope sequence comparison with `true` fails the replay and
future-sequence Lean controls. Replacing composition admission with constant
success fails `revokedPermissionRefused`. Both defects were restored and all
twelve modules verified again. The diagnostic command was `lexlean --project
<diagnostic-project>/lexlean.toml verify --all`; that separate host project is not
the immutable SDK gate. An initial diagnostic invocation without the configured
Elan environment failed to find Lean; no successful verification was claimed
from that invocation.
