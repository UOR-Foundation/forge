# FA-53 — Version preview ownership model and wire protocol

Authority: `VersionPreview.transitionPreview`, `VersionPreview.boundary` and `VersionPreviewProtocol.previewWireBoundary`.

A preview state contains a uint32 revision, active flag, owner, original identity and current identity. Identities retain all 256 bits in eight uint32 limbs. Acquire records an origin without requesting a source write. Selection preserves the origin while requesting a new current target. Return requests the original target and closes ownership. Restore requests an independently prepared target and closes ownership. Recovery changes the owner while preserving both identities and requesting no source write. Every admitted operation increments revision; malformed state/commands, stale or exhausted revisions, occupied acquire, inactive operations and conflicting owners refuse.

The protocol has exactly 31 request words and 29 successful response words, with bounded lowercase little-endian hexadecimal representation. `forge:version-preview` delegates directly to the guest; the JavaScript codec does not implement preview transitions. The command inventory now has 334 commands and 96 adapters.

## Local evidence

The FA-53 ID, scenario and missing-test failure preceded implementation (`version-preview-model-red.log` in the execution evidence workspace). There are 24 finite model controls, six parsed protocol controls, two raw-byte controls and 30 independent literal wire cases. Raw-byte controls retain the declared Lean axioms `Quot.sound` and `propext`.

The model-only diagnostic verified one module with receipt `9c7d83c7fc9320bb5b581f962bc2f83e25b249e8b96482b15ea179171da1a879`. The protocol diagnostic verified six modules with receipt `d25555922dae27c568db279aeba456717c4cf25181e2afff31ed9f81f6ff4116`. These host diagnostics do not replace the exact locked SDK.

The 320-test local Node suite, workspace Rust conformance, Clippy, formatting and shell parsing pass. Six planted codec defects were rejected: wrong identity width, uint32 overflow acceptance, capture after awaiting readiness, trailing output acceptance, missing active-owner validation and substitution of runtime failure identity. Restoring the codec restores all six controls. Logs are `preview-codec-mutation-*.log` in the execution evidence workspace.

## Open qualification

The full 21-module executable graph passes the host diagnostic with receipt `113d9a2ff168b62ab4f648248229f7cd405598069f8af5ff009a4bfc22d82901`. Four semantic mutations (overwrite the original identity, return to the selected identity, bypass revision checking, bypass owner checking) each failed verification with LLV7002. Restoring the model restores receipt `9c7d83c7fc9320bb5b581f962bc2f83e25b249e8b96482b15ea179171da1a879`. These diagnostics do not substitute for the locked SDK. The embedded corpus grows from 215 to 245 cases. A new signed guest, exact runtime replay, document/worker checks, reproducibility and complete locked-SDK/Studio acceptance remain mandatory. Runtime and browser replay scripts are required by Studio and do not substitute fixture outputs when the installed guest is older.

This is the model/protocol feature. It does not by itself implement the imported version-preview actor, window interests, source mutation transactions, editor exclusion, abandoned-tab recovery, restore-to-message, or native UI journey. Exact snapshot validation, project binding, compare-and-swap and exclusive Web Lock ownership remain browser-adapter obligations. Numeric owner IDs do not authenticate a caller. No independent review or release acceptance is claimed.

The canonical-format build 43104652757 passes. Its source is `2381dcda5372af9193cd9371e573d385c7f6a04f`; the signed 687271-byte archive contains a 63975-byte guest. Exact-source/workflow Sigstore verification passes, with changed-byte and wrong-source negative controls. All 245 embedded cases, 30 preview wire cases and the inherited routing/queue/interaction/event/work/composition corpus replay in document and worker contexts. The refreshed 320-test Node suite passes. Actual full-host and independent reproduction acceptance remain required.

Independent signed build 43112346451 (artifact 13897683589) reproduces all 687271 archive bytes from build 43104652757. Both provenance bundles verify against exact source `2381dcda5372af9193cd9371e573d385c7f6a04f`, repository and build workflow. SHA256: `96085efc7b9f7d34aa37f1a4a246462459dbd4f1ff8a4af87fa2e8461a982da2`. This is guest component reproducibility, not whole-application release acceptance.
