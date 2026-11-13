# Stateful application journeys

Authority: `FoundrySpecification.interactionJourneyBoundary` and
`InteractionModel.interactionStep`; registered capability FA-42.

The Interactive apps control creates a gallery or garden as a stored project.
Its authoring document regenerates a literal canonical Application module and
carries the exact interaction model source. The standard run command opens the
same native runner. Guest output selects the screen, palette, tone and movement;
the adapter never computes a transition. State is model-bound and revisioned,
commits with source and prior-state comparison, survives reload and is removed
with its project. Changed profiles require explicit reset.

Audio starts disabled, requires a gesture and stops on mute, close or hidden
page. A late browser resume cannot renew revoked consent. Reduced motion is
passed to the guest and suppresses rendering animation. Text and illustrations
use closed DOM adapters; controls are native keyboard-operable buttons.

## Evidence

The registered scenario and missing-oracle failure preceded implementation.
Six Node controls cover source mismatch, bounded presentation, guest dispatch,
stale model reset, mutable input, revoked resume and transactional integration.
All 254 Node controls, full local Rust tests, Clippy and shell parsing pass locally. Diagnostic LexLean
verification of the specification, interaction model and generated instance
passes with receipt
`d672a34d7627a70b7d034564ea401fe2b9f87e5795e69b75f8d61c76e4a5e140`.
This host diagnostic does not replace the locked SDK acceptance gate.

The old event-only guest cannot open a gallery: the actual browser journey
fails to reach its first screen. The signed 145-vector guest then passes the real browser journey: keyboard gallery navigation, reload recovery, coordinated garden domains, unrelated edits preserving state, changed-model refusal and reset, canonical source write refusal, one winner in a forced overlapping transaction, abort rollback and deletion cleanup. Independent offline audio rendering using the production oscillator adapter measures a 440 Hz spectral peak and exactly silent samples without consent. Native audio enable/mute and reduced-motion rendering pass with zero page exceptions. One local create-to-screen sample was 402 ms; this is a measurement, not a production performance threshold or clearance of the Pages hold.

Eight planted defects are rejected: canonical source comparison removal, presentation bound enlargement, stale model reuse, mutable input aliasing, late resume renewing revoked consent, transaction comparison bypass, audio consent bypass and accepting a guest refusal. The browser oracle catches transaction and audio defects through actual IndexedDB and audio samples. The meta-gate initially rejected the incorrectly numbered Rust wrapper; corrected to FA-42 without weakening it. The browser locator was scoped to its dialog after it correctly found both sidebar and catalog entries.

Exact-head full SDK/Studio acceptance remains required before readiness.

## Scope

This capability covers the finite stored interaction application profile.
It does not establish arbitrary generated-code preservation, publication,
same-origin authentication, human sensory quality or whole-release acceptance.


## Reduced-motion oracle follow-up, 2026-11-13

The Studio run `43442701613`, job `131944106428`, for published PR #166
head `6cf3829d6753a036c5deebbc750925d0bac21918` failed the existing
`getAnimations({subtree:true}).length === 0` assertion with nine effects after
two animation-frame callbacks. Its logs contain no effect identities, states,
or timings, and the run retained no artifacts. This does not establish whether
the nine effects were still moving, pending, or finished. The generated renderer
stylesheet and complete application build were unavailable in this local checkout.

The production adapter already checks both the guest motion output and the
current reduced-motion preference before creating its garden animation. The
stylesheet retains a `0.01ms` duration for CSS transitions and animations in this
mode. No adapter, CSS, declared model, or generated projection was changed by this
follow-up. A two-frame count is not a completion contract: Web Animations can
retain finished filling effects, and pending effects need not have settled when
a fixed number of callbacks has run. See the [Web Animations timing and playback
states](https://www.w3.org/TR/web-animations-1/).

The journey now uses the actual page's reduced-motion preference and animation
states. Finished non-pending effects are not classified as movement. Only running
CSS effects with finite duration/end time at most `0.01ms`, one iteration, no
delay, and normal playback may settle. Active long, delayed, repeating, paused,
JavaScript, or unknown-timing effects fail immediately, with their type, target,
state, and timing in the diagnostic. Tiny effects must disappear or finish before
a one-second wall-clock deadline and remain quiet for two further painted samples.
A stopped frame scheduler also times out. Nothing is cancelled or fast-forwarded
by the positive oracle.

The existing six Node controls remain. A seventh deterministic control exercises
late tiny effects, retained finished effects, pending effects, missing preference
or application nodes, unknown timing, active movement, a persistent tiny effect,
and a stalled frame scheduler. The Rust wrapper now requires exactly seven tests
and seven passes with no skipped, cancelled, or todo results. All seven pass on
Node 24.22.1; the adjacent interaction-model and shell-UI suites pass 13 controls.
Syntax checks and `git diff --check` pass. The first test run failed for the missing
oracle module before its implementation was added.

Thirteen planted source defects each make
`node --test --test-reporter=tap studio/tools/stateful_application_journeys.test.mjs`
fail: permitting long effects, ignoring pending finished effects, omitting the
media check, permitting unknown end times, deleting the deadline, accepting the
first unpainted sample, removing the CSS browser negative control, and inspecting
the wrong DOM subtree. Additional plants discard persistent tiny effects, omit all
browser plants, skip their negative assertion, change the Rust test/pass counts
back to six, or ignore that Rust wrapper; each is rejected by the Node control.
The actual Rust wrapper was not compiled locally. The restored command passes
all seven tests. The browser
journey additionally plants a real indefinite Web Animation and an overriding
indefinite CSS animation, requires each to be refused, removes each mutant, and
rechecks the restored application.

Those new real-browser controls have **not** executed locally. The known local
Chromium socket restriction was not retried, and the actual SDK, Cargo, Docker,
Just, core Wasm, and renderer assets were unavailable. The local deterministic
controls are not browser or SDK qualification. The next exact-head Studio run
must either pass the unchanged production behavior with both browser negatives
or report the active effects precisely; the original nine effects are not
retroactively classified as harmless. Exact locked-SDK `just vv`, generated
model verification, independent review, and full final-head CI remain required.
