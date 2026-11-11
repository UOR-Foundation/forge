# Stateful application model (FA-41)

Authority: `app/src/InteractionModel.lex.tex::interactionBoundary` and
`app/src/InteractionProtocol.lex.tex::interactionWireBoundary`.

This finite profile extends application semantics beyond decision tables. A
versioned graph contains declared screens, bounded frames and unique state/event
routes. Generated evaluation selects the next state and coordinated screen,
palette, tone and motion outputs. Missing audio consent makes tone zero;
reduced-motion preference makes motion zero. Invalid graphs, invalid states and
undeclared interactions have distinct typed refusals. The browser codec only
represents requests and validates replies; `forge:interact` delegates to the
signed guest, with no semantic fallback.

The registered ID, scenario and missing-oracle Rust failure preceded the model
and implementation. The initial Node oracle failed on its missing codec. Twelve
model controls include general consent/motion/output-state properties and finite
positive and negative transition controls. Protocol controls cover parsed-word
composition, raw empty input and trailing input. Twenty-one independently packed raw
requests cover gallery navigation, coordinated garden outputs, malformed data
and invalid models, including a full 32-frame/128-edge profile. All twenty-one are embedded in the generated guest acceptance.

An invalid title phrase, one missing parser parenthesis and a forward declaration
were caught by diagnostic linking and corrected. Direct proofs over complete byte
strings exceeded Lean's fixed reduction budget; `decide` could not reduce them
either. The proof obligations are factored into model semantics and parsed-word
composition, while raw requests remain executable SDK acceptance vectors. The
empty-axiom policy on word proofs is exact, not an upper bound. No proof resource
limit, trusted axiom or acceptance vector has been relaxed.

Five restored codec mutations are rejected: changed endianness, list-bound
bypass, inverted flags, decoding before the reply-size bound and guest bypass.
A separate diagnostic semantic mutation removed audio-consent suppression; Lean
rejected the general silence property and finite transition controls with
`LLV7002`. The model source was restored. The reply-size mutation initially survived because later syntax validation still
refused its value; the oracle now observes that oversized input never reaches
UTF8 decoding. Local Node/Rust/Clippy checks pass. A real browser against the old
installed guest fails `interaction: galleryCurrent: invalid`, establishing that
the new interaction corpus is not silently handled by the earlier guest.

Diagnostic verification of the six-module interaction/protocol dependency closure
passes with receipt `829f2e14bd603cdee6f505aa7de284503d647a01399929c7378966bc6d6a67e2`.
This uses a different compiler identity and is not locked-SDK acceptance.

Qualification remains open until exact-source immutable-SDK compilation, signed
guest installation, independent page/worker replay and full feature acceptance.
These model and protocol controls are not evidence that generated application
creation, state persistence, rendering, audio permission UI, sensory quality or
whole-product conversion are complete. Those integrations have separate
acceptance boundaries.

## Signed execution qualification

Build 43075425831 and artifact 13881743759 compile source `8baef63680ba67b8608a0e750aceba4ef8b5073a` in the locked SDK. GitHub CLI verification accepts the exact source, repository and build workflow and rejects a wrong source and changed archive byte. The installed guest is 28,489 bytes; all 145 embedded cases and the 21 interaction cases execute in both the document and dedicated worker. Archive SHA-256 is `470470068748a71fd28a22ef39f87d90db6fdfac8091a574b7f0a48753b79d0e`. Separate reproduction and final-head CI remain required before this feature is ready.
