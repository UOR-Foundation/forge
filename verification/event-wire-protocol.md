# Event wire protocol (FA-33)

Authority: `app/src/EventProtocol.lex.tex::boundary`, invoking
`EventAdmission.admitEvent` and the existing composition admission model.
The ID, scenario and missing-oracle Rust failure preceded implementation.

The protocol transports the complete policy/features, versioned event contract,
expected generation/sequence and envelope in bounded lowercase hex uint32 words.
It reuses the composition parser, checks complete input consumption and canonical
flags, and bounds byte payloads at 1024 entries and the whole payload at 32768
ASCII bytes. Typed replies preserve event errors and nested composition refusals;
success returns the next sequence. The codec only represents bytes and validates
reply shapes. It does not authenticate participants, persist sequence state or
claim event delivery.

The independently constructed corpus has 30 cases, including natural/flag/byte
payloads, maximum byte payload, sequence exhaustion, revoked permission, malformed
and trailing requests. Five Lean theorem controls replay complete wire requests;
ten new embedded guest vectors cover positive and negative admission. Six Node
controls cover exact encoding, invalid shape/value bounds, all expected replies,
malformed replies, guest authority and model wiring. Five planted codec defects
were rejected: endianness, shape checking, flag canonicality, oversized-response
predecode bound and runtime error isolation. The first size mutation survived
because unknown decoded strings also refused; an independent decoder-call probe
now verifies that oversized replies are refused before decoding. Every mutation
was restored.

This initial source revision requires signed SDK compilation and installation of
the resulting guest before runtime integration can be accepted. Existing kernel
artifact receipts still describe the earlier installed guest. No event-delivery
or whole-conversion claim is made by source/model availability alone.

Supplementary diagnostic verification passed all 13 modules with attestation
`f7914549e6343f158d48b4e94bac76d78bf833023cd510575cb9c7508203597e`.
All 191 Node controls and local Rust/Clippy pass. The newly required actual
browser corpus fails against the previous guest at `event: natural`, as expected;
this is retained evidence that old executable bytes cannot satisfy the new gate.
Signed SDK build source is `3cc266da289becc4b3aef8a332ff4509e5df8cc8`.

Signed SDK build 43053854542 refused the initial application vector assembly
with PP2001, `application acceptanceVectors is not a closed list`. The ten new
cases now use a closed cons-list alias ending in the existing acceptance list,
as required by the selected SDK; no acceptance case or admission rule changed.
Main's d31bc32 integration and 4e22147 lifecycle-race fixes are retained. All 197
combined Node controls and the real IndexedDB reword-race browser test pass.

A diagnostic mutation replaced the caller's expected generation with the
incoming envelope's generation. Lean rejected the stale-generation wire theorem
with LLV7002 (`rfl` failed), at EventProtocol.lex.tex:166, generated Lean line 54.
The probe initially expected the theorem name in the compiler text; the actual
source location and expected staleGeneration bytes identify that control. The
original model was restored. The environment restarted during the subsequent
whole-project verification, so that interrupted run is not a passing receipt.

Build 43055159790 admitted the closed vectors but exposed the selected SDK's
flat Rust symbol namespace: event `encodeResult`/`dispatchWords` collided with
existing work/composition functions. Event-specific parser/result symbols now
have unique names. This changes no wire bytes or admission rule and does not
replace the SDK compiler. New signed compilation remains required.
