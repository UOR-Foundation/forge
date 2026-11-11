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
