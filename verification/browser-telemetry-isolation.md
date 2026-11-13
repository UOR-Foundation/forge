# Browser telemetry isolation (FA-30)

Authority: `app/src/FoundrySpecification.lex.tex::browserTelemetryBoundary`.
The ID/scenario preceded the missing-oracle Rust failure. Whole-shell inspection
had observed PostHog feature-flag/configuration and exception-loader requests
before consent. The existing before_send filter was too late to prevent them.

A TypeScript-parsed browser projection removes the unique SDK initializer,
retaining the actual imported uninitialized client for renderer context
compatibility. It does not substitute a mock analytics implementation. The
projection refuses missing, duplicate or changed initializer/setting shapes.
Settings and search explain that browser vendor telemetry is disabled, with no
enable switch or displayed telemetry identifier. Host reads strip legacy IDs
and normalize consent; writes persist that policy and refuse opt-in attempts
before storage. The renderer envelope preserves the typed private refusal.
Upstream vendored source is untouched; owned transformations are recorded in
`vendor/dyad/VENDORED.md` and shared by the build and typecheck.

Six Node controls exercise fresh/legacy settings, input preservation, typed
refusal, actual host read/write behavior, no writes on refusal, error redaction
and mandatory build/browser gates. The executable projection test checks the
actual imported files and ten drift refusals. Chromium runs the installed
PostHog SDK with the actual projected initializer: capture, exception, identity,
registration and feature-flag calls create no requests or persistent identifiers
under fresh or legacy opted-in consent. A real-SDK initialization negative control
is detected before any third-party transmission. An initial fixture incorrectly
assumed get_config was a public SDK method; the corrected fixture observes the
actual config property and retains every capture/identity control.

The actual built renderer/host Settings journey displays the privacy statement,
has no collection switch or ID, and returns browserTelemetryUnavailable for an
enable attempt. It has no page exceptions or unexpected outgoing requests.
This test isolates the renderer with service workers disabled (worker behavior is
qualified separately by FA-29), intercepts decorative images, and supplies the
existing Monaco CDN dependency from its exact installed 0.52.2 package. Blocking
that editor loader had exposed four unhandled Event errors; these are a separate
remaining offline dependency defect, not telemetry failures. The fixture does
not claim live CDN availability or complete offline Settings behavior.

Six planted defects were rejected: retaining legacy collection/IDs, accepting
opt-in writes, dropping typed refusal, retaining the initializer, accepting
ambiguous initialization, and retaining the old enable settings. Every mutation
was restored. All 173 Node tests, local Rust workspace/Clippy, parser, renderer
contracts, actual SDK/browser controls and renderer build/typecheck pass. The
build introduces no new errors against the imported renderer's 29 baseline type
errors. Supplementary 12-module model verification attestation:
`e4d6aef1c58f2793d301faba7b5a4ffeed26b11570a0869f1f589a84ece92d7e`.
Full immutable SDK and Studio feature CI are pending at the initial revision.

A subsequent complete live-preview diagnostic with the real worker/core/kernel
passed the existing budgets: first-node paint 16 ms, check 34 ms, stream patch
work at most 11.6 ms, edit action-to-paint at most 20.3 ms, one frame load and zero
reloads/page exceptions. The prior FA-29 run failed at 41.7 ms. Both observations
are retained; one subsequent pass does not prove a causal speedup or universal
performance. Local diagnostic receipts remain unattested and are not release or
publication evidence. AI, publishing, decorative media and editor dependency
requests remain separately scoped external effects.
