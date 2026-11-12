# Atomic chat preferences — FA-77

Authority: `FoundrySpecification.chatPreferencesBoundary` and the imported renderer `UpdateChatParamsSchema`. Registration and failing Node/Rust controls precede implementation at `db31ae813554c3a71f2bd5f85f51c616376eebe9`.

The host previously discarded mode and model updates and skipped empty titles. The adapter now captures and validates the imported schema before awaiting database readiness, validates positive safe chat/project identities, and merges only supplied preference fields in one apps/chats readwrite transaction. Existing transcript and unrelated fields survive. Transaction completion is the only successful acknowledgement. Invalid inputs, missing records, malformed stored identity and storage failures have four fixed modeled public errors; private exception text is not exposed.

Four focused controls pass through the Rust conformance gate. All 459 Node controls, full Rust workspace tests, Clippy, formatting, shell parsing, imported-schema reproduction and byte corpus pass. Host LexLean diagnostic verifies two modules with attestation `2d22e621a3f4730d7ace64c52c4cf774c97ae0023c6f76332d5006db5cfad2f8`; this is not immutable SDK acceptance.

Six Node mutations are rejected: dropping model updates, dropping empty titles/null modes, replacing transcripts, acknowledging before commit, omitting project identity validation, and bypassing the imported schema. Commands: `node --test studio/tools/atomic_chat_preferences.test.mjs` and `cargo test -p repo-conformance --test atomic_chat_preferences`. Restored controls pass.

Actual Chromium covers two windows, disjoint preference updates, concurrent transcript updates, reload, per-chat token capacity, disclosed and transmitted per-chat model selection despite a different global default, late write-success/transaction-abort and deletion without resurrection. The missing-model mutation fails the actual stored-model assertion. Broader integrated qualification is in progress.

The first generation fixture used an OpenRouter selection and observed the existing product routing/default behavior instead of the requested model. The qualified persistence journey uses the offered Featherless model. An initial transcript fixture omitted message IDs; it was corrected to valid stored messages. A later run timed out before disclosure; the subsequent run passed. These diagnostic failures are retained and are not evidence of successful acceptance. OpenRouter routing, Ask/Plan execution behavior, and other remaining product boundaries are separate uncompleted obligations. Persisting a mode does not grant it execution semantics.

No factory substitute or SDK change is introduced. Exact-head hosted acceptance and independent review remain outstanding. This feature does not establish completion of the entire conversion.
