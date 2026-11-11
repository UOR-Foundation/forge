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
