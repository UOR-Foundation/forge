# Public GitHub publication permission

Authority: `FoundrySpecification.githubPublicationPermissionBoundary` (FA-45).

The publication adapter captures the bounded model, axioms and attestation before
its first await. A read-only authenticated account lookup identifies the exact
public repository. A native dialog displays that repository, site, template,
source and complete captured model payload, describes credential ownership and
public effects, and focuses denial. Approval is required before any mutation.
Every write checks cancellation, connectivity, permission expiry and the current
canonical rules against the approved rules. API requests refuse redirects and
omit ambient credentials. Tokens are never displayed in the disclosure.

Approval must occur within five minutes and expires after one hour. Stop cannot
undo submitted commits or remote builds; the dialog states that limitation.
Typed private refusals cover missing, invalid, denied, expired, offline and
unavailable permission, and changed source. Existing cancellation and publication
identity qualification remain separate requirements.

## Evidence

The ID, scenario and failing conformance test preceded implementation. Six Node
controls cover the native dialog and actual build adapter, including caller and
callback mutation, missing authorization, malformed approval, per-write checks,
source changes, cancellation, expiry, offline and private UI failure. All 272
Node controls pass. Local workspace Rust tests, Clippy and shell parsing pass.
Diagnostic LexLean verification of the specification and imported registry
passes with receipt
`a71851fff1e89325383417e6e69f266b4f7576687c6b37e5c7358a2b192bbc0f`;
this does not replace the exact locked SDK acceptance gate.

The Chromium journey uses the actual permission dialog and GitHub adapter with
deterministic API responses and an assumed proved-rules fixture. Denial,
cancellation, offline and stale source produce zero writes. Approval sends the
captured payload; a subsequent source change blocks the next mutation. Markup
is displayed as text, credentials are absent from the dialog, redirects and
ambient cookies are refused, and no page exceptions occur. The test does not
perform external writes or establish that its fixture is genuinely proved.

Eight planted defects fail: omitted authorization requirement, omitted write
guard, caller aliasing, callback aliasing, stale-source acceptance, redirects,
permission expiry bypass and denial bypass. The callback-alias mutation first
revealed a swallowed assertion inside the transport fixture; moving the payload
oracle outside the network wrapper makes that defect fail. All sources were
restored and acceptance rerun. The browser journey is mandatory in Studio CI.

Full exact-head SDK and Studio CI remain required for readiness. This feature
does not establish complete release closure, production template trust, rollback
of public effects or whole-application conversion.
