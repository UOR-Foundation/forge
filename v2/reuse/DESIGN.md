# Address-based reuse: design

Four mechanisms, each a LexLean model under [src/](src) and a thin adapter under [adapter/](adapter).
Sources studied: Hologram at `b6d9a76` (read only, nothing built or run) and PrismPM at `527cd58`, `docs/proposals/fast-verified-builds.md`.

## The split, for all four

The model decides and writes every preimage. The adapter hashes, moves bytes and orders work.

- An address is BLAKE3 (the repository's copy, `studio/shell/prism-code/src/blake3.mjs`, which imports cleanly and passes the official empty-input vector) over a preimage the model returns, read as one 256-bit natural number.
- The model compares addresses as natural numbers. That is a modelling choice with a reason: the only proof tactic available, `linear_arithmetic`, ends in `omega`, which reasons about `Nat` and not about byte strings. A 32-byte digest and a number below 2^256 carry the same information.
- Every preimage starts with a domain tag and version (`prism/reuse/<kind>/1\n`), and every variable-length field is framed by an 8-byte big-endian length. Hologram's keys have neither; see below.
- The model's decisions are written once as a natural-number code (proved about) and once as a typed result built from that code (what adapters read). Tests cover the mapping.

## 1. Address every declaration ([Address.lex.tex](src/Address.lex.tex))

Taken from Hologram: a node's reuse key is derived from its own content and the keys of its inputs (`derive_label`, `crates/hologram-archive/src/address.rs:108-116`), so a change propagates through the graph by itself. Operand sets are sorted before keying (`hologram-exec/src/session.rs:1101-1103`).

Not taken:
- Keys without tool identity. Hologram's key has no kernel, backend or version. Here the toolchain (compiler semantics id, Lean toolchain, lexicon versions) is its own preimage, and its address is a field of every declaration key, so no key outlives its tools.
- Unframed concatenation. Hologram hashes `opcode ‖ params ‖ labels` with no length between params and labels; here every field is framed.
- Soundness by assertion. Hologram's memo relies on a comment saying kernels are deterministic. Here the staleness decision is proved; the hash's collision resistance is assumed and stated.

Model decides: the toolchain preimage, a declaration's own preimage (kind, name, body), the dependency-set preimage (canonically ordered addresses), the key preimage (toolchain, own, dependencies), whether a dependency set is valid (no duplicates), and staleness: fresh, toolchain changed, own bytes changed, a dependency changed, or added. The toolchain is checked first, so a toolchain change never reads as fresh.

Adapter does: orders declarations dependencies first, refuses cycles and unknown names with typed errors, hashes each preimage the model returns, and asks the model for the recheck list.

## 2. Share the proof cache ([ProofCache.lex.tex](src/ProofCache.lex.tex))

Taken from Hologram: the lookup happens before the work on its hot path (`session.rs:886-892`, `:1124-1130`); content addresses make results shareable between machines, as its HTTP gateway does for blobs.

Not taken:
- Lookup after the work. Hologram's compiler cache runs the work and then consults the cache (`hologram-compiler/src/compiler.rs:251-292`). Here the model's protocol answers `consult` until the cache has been consulted, and `work` only after a refusal or a miss. Proved.
- Trusted hits. Hologram's pool and warm store return hits without re-hashing (`buffer.rs:437-458`, `warm.rs:32-38`). Here a record is admitted only when its declaration address, toolchain and claim match the query exactly and the attestation the server sent re-derives to the attestation address the record names. The server is not trusted.
- Following PrismPM's proposal: an artifact is reused only after a check on read; a failed check is a miss. The proposal reuses artifacts, not verdicts; this cache reuses verdicts (attestations) and is therefore stricter: the attestation itself must be present and verified by the caller.

Model decides: admission with a typed refusal (address, toolchain or claim mismatch, attestation missing, attestation unverified), and the next step (consult, reuse, work).

Adapter does: calls the injected transport, re-hashes the returned attestation bytes, runs the work when told, publishes the new record.

## 3. Store by address in the browser ([Store.lex.tex](src/Store.lex.tex))

Taken from Hologram: `KappaStore`'s interface (put returns the address, get by address), OPFS as the browser backend, and suspend to one address (`hologram-runtime/src/lib.rs:780-801`).

Not taken:
- Unverified local reads. Hologram's OPFS pack store and native store return bytes without re-hashing (`opfs/sync_store.rs:74-90`, `native.rs:492-545`), although its documentation says reads re-derive. Here every get re-derives the address and the model refuses a mismatch.
- A checksum stored beside the data. Hologram's emulator snapshot keeps its expected hash in a sidecar file in the same storage, which detects corruption but not tampering. Here the expected address is the one the caller asked for.
- Positional, unversioned snapshots. Hologram's runtime snapshot is a positional record capped by a truncating `u32` length. Here a snapshot is a set of addresses, canonically ordered by the model, refused if it holds a duplicate, framed with an 8-byte count.
- Non-atomic writes. Hologram's `opfs_put` and `FileWarmStore::put` write in place. Here a write goes to `<address>.partial` and is moved into place.
- One pack truncated on every boot. Here one file per address persists across loads.

Model decides: the blob and snapshot preimages, the canonical member order, whether a read is accepted, whether a restore is accepted (the snapshot re-derives and every member reads back).

Adapter does: the two backends (memory and OPFS, same interface), parsing a stored snapshot (untrusted: its address is re-derived from the model's preimage of what was parsed), and the hashing.

## 4. Compute ahead ([Ahead.lex.tex](src/Ahead.lex.tex))

Taken from Hologram: a pure function over a finite domain is computed once and looked up afterwards (activation tables, `hologram-compute/src/cpu/lut.rs:43-67`). Here the finite domain is the actions on one screen.

Not taken:
- Tables keyed by an enum index with no invalidation. Hologram's tables are process-global and keyed by `(activation, dtype)`; one is keyed on the activation alone while the function is passed separately (`kernels.rs:619-624`). Here a table is keyed by the app's address and the state's address, every entry by the event's address, and a lookup whose app or state differs answers `compute`.
- Responses held in the table. Here an entry holds the address of the response; the bytes live in the store of mechanism 3 and are verified when read.

Model decides: hit or compute. Proved for every table: a different state or app never hits. Proved for the counter instance: a hit equals computing.

Adapter does: while idle, runs the app's own `dispatch` (the app's model, through the interpreter) for each action on screen and stores the responses; on an action, asks the model and either reads the stored response or runs `dispatch`.

## Not adopted at all

Hologram's tensor engine, container runtime, emulators and network layer. None lies between a keystroke and a pixel or between an edit and a proof.
