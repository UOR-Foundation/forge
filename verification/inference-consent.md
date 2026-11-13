# Per-request cloud inference consent (FA-34)

Authority: `app/src/FoundrySpecification.lex.tex::inferenceConsentBoundary`.
The ID/scenario and missing-oracle Rust failure preceded implementation.

The actual paid-generation adapter now captures an immutable disclosure before
transport: provider, exact endpoint, model, whether the selected key belongs to
the visitor or site, request size and exact encoded JSON bytes. The credential
itself is not passed to the disclosure. The modal explains messages, history and
project contents, potential provider retention, charge ownership and limits of
cancellation. Request text uses textContent, so supplied markup cannot execute.

Approval is per request, including the existing bounded retries of identical
bytes. No persisted setting or previous approval authorizes the next request.
The native modal starts on Don't send and supports Escape. Decline, caller
cancellation, offline state and a five-minute maximum approval deadline prevent
submission. Invalid disclosure and unavailable UI have fixed typed refusals.
Successful approval exposes a linked abort signal and active Stop control;
completion removes the control and listeners. Stopping cannot recall transmitted
data or guarantee remote termination or charge reversal. Existing bounded
transport now refuses redirects and omits ambient cookies. The unbounded legacy
stream exposed only by __chat, unused by the renderer, is removed.

Six Node controls exercise immutable/bounded disclosure, pre-UI refusals,
modal lifecycle, exact approved scope, the actual paid adapter and the transport
options. Real Chromium runs the built shell, actual core request encoder and
paid-generation adapter. Provider requests are intercepted before transmission.
Both OpenRouter and Featherless send exactly the disclosed body on approval;
Escape, decline and pending cancellation submit nothing. Every subsequent
request asks again; active stop yields inferenceCancelled, offline requests and
expired approval refuse, and no page exceptions or credential text appear.

Six planted defects were rejected: automatic approval, wrong displayed bytes,
offline bypass, ignored active stop, included cookies and followed redirects.
The first wrong-disclosure probe timed out because the intentionally failed
assertion left its test's normal five-minute approval timer alive. It is not
counted as evidence. Tests now use a 100 ms deadline for their synthetic DOM
while preserving the production maximum; the same defect produces a concrete
assertion failure and all six mutations are restored. The real browser test
uses native dialogs and the production policy.

All 203 Node controls, local Rust workspace/Clippy, shell parsing, brand contract
and real browser consent acceptance pass. The existing renderer bundle is
unchanged; consent is implemented in the shell effect adapter. Local browser
provenance remains an explicit diagnostic. Full immutable-SDK and Studio gates
must pass at the published revision; the parent event guest is still being
qualified. This feature does not claim complete external-effect authorization,
provider retention enforcement, identity authentication or whole conversion.

Supplementary diagnostic verification passed all 13 modules with attestation
`02a4d33ee758a22d3b1bd987942e688fe0f72d2faa5b86736751fb28f96bef14`.
The real browser also receives a provider redirect response: transport refuses
it as inferenceNetworkFailed and makes no request to the redirected destination.
Malformed top-level disclosures now return invalidInferenceConsent explicitly.

Integration retains PR #69's cumulative import materialization bound, bounded
local imported-message IDs and active-shell navigation binding. The merged
source passes all 206 Node controls, the full local Rust workspace and Clippy,
and the real paid-adapter consent browser test. The event branch independently
passes the updated cache browser test online and offline, including corrupt
update refusal and recovery. These checks do not remove PR #69's release hold.
