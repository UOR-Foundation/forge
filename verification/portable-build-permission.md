# Portable build permission

Authority: `FoundrySpecification.portableBuildPermissionBoundary` (FA-44).

Portable compilation now asks for explicit permission for its exact captured
source and the fixed esm.sh/package and cdn.tailwindcss.com/styling destinations.
The dialog explains generated-code execution, possible transmitted data,
credential ownership and limits on stopping remote effects. Denial is focused
by default. Approval lasts at most two minutes and leaves a Stop build control.

The temporary styling grant carries source, purpose and expiry through the
existing atomic grant transaction. Package retrieval and promotion recheck it;
stored revocation aborts the lease. Source is checked before effects and before
returning output. Stop, failure and completion abort requests and remove the
frame and grant. The service worker rejects expired portable grants even after
a page crash; startup removes their records and cached frames.

The actual styling journey exposed two pre-existing defects: text-only roots
were never recognized as rendered, and stable reports of missing classes could
be promoted. Text or element roots now count as rendered, and uncovered classes
produce typed `portableBuildStyleIncomplete`. The style probe remains a runtime
check, not independent evidence of visual fidelity.

## Acceptance evidence

Registration and a missing-test failure preceded implementation. Six Node
controls exercise disclosure, denial, stale source, grant checks, stop, stored
revocation, offline, expiry, malformed approvals and cleanup. The full local
suite has 266 Node controls. Local Rust tests and Clippy pass. Diagnostic
LexLean verification of the specification and imported registry passes with
receipt `855ccbba5bd249759e32db96f16c88576d4c84ec44c0b99f143dc67967f4ecc2`.
This diagnostic is not a substitute for the locked SDK.

A real Chromium test uses the actual locked compiler and verified service
worker, with deterministic transport fixtures for the two disclosed origins.
It executes the resulting portable HTML independently, rejects incomplete
styling, and tests denial with zero network, changed source, offline, Stop,
stored revocation, expired-worker refusal and reload cleanup. It observes zero
page exceptions. It does not claim acquisition or behavior of the production
CDNs from those transport fixtures.

Seven representative defects are rejected: changed destination, omitted initial
source check, removed abort mechanism, omitted grant cleanup, wrong-source grant
acceptance, worker expiry bypass and acceptance of incomplete styles. Removing
only the early abort initially survived because the finalizer also aborts; the
representative defect removes both paths and the abort oracle rejects it.
Browser mutation candidates are freshly projected so the real worker receives
the changed candidate; all sources and generated local artifacts are restored.

Full exact-head SDK and Studio acceptance remain required before readiness.
Public GitHub publication permission, dependency locking, compiler preservation,
human quality and complete release qualification remain separate obligations.
