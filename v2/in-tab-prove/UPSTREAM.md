# Upstream requests from the in-tab proof experiment

None of these is filed. Each is written to be filed as it stands. Evidence for each is in `REPORT.md` and `evidence/`.
Versions: PrismPM `35e9f01d5415ed4b0b64c152238f291546957ec4` (LexLean 0.3.0), Lean 4.32.1 (`f054605a`),
lean4export `86e4a339` (tag v4.32.2), nanoda_lib `0da9f98f` (0.4.32).

## LexLean

### 1. Keep the proof terms: publish an export with the verified set

`lexlean verify` elaborates into a staging tree and then deletes every `.olean.private` and `.olean.server`
(`src/verify/mod.rs`, the scratch clean-up before stage 15). With Lean's module system the proof terms are in the
private part, so the published `verified/<id>/oleans/*.olean` cannot be replayed or exported: `lean4export` on them
fails with `failed to open file '…/Payment.olean.server'`. Nothing downstream can re-check a proof without elaborating
again.

Request: an option on `verify` that writes, into the verified set and the attestation (path, byte length, sha256):

- `exports/<module>.ndjson`: lean4export format 3.1.0, the module's attested declarations with their dependency
  closure;
- `exports/library.ndjson`: the same for the runtime library alone (`LexLeanRuntime.*`, `LexLeanCollections.*`,
  `LexLeanLaws.*`), exported first so that it is a byte prefix of every module export.

Measured on two projects: the library export is 25.7 MB (4.1 MB gzip), byte-identical between them, and a prefix of
both whole exports; a single theorem's closure is 0.5 to 4.1 MB (83 to 657 KB gzip).

### 2. Bind each theorem's statement in the attestation

The attestation lists a theorem's name, policy and observed axioms, not what it states. A checker of exported terms
can confirm "the declaration named `clearAdvances` type-checks" and cannot confirm "its type is the statement in the
spec". Request: per theorem, the sha256 of its exported type term (the NDJSON lines of the type's closure, in export
order), and of each definition its statement mentions. With request 1 this lets a second party check name, statement
and proof against one attested record.

### 3. Publish the runtime library's proofs once per compiler-semantics ID

In `lexlean verify` on `v2/probe-payment` the three runtime modules took 66.6 s of 79.0 s of elaboration and 35.8 s
of 62.1 s of replay (`evidence/payment-telemetry.jsonl`). They are the same bytes for every project of one
compiler-semantics ID. Request: ship their `.olean` set (all parts) and their export as an addressed artifact, and
let `verify` admit them by digest after checking the digest, as `v2/reuse` models.

### 4. A proof form that needs no tactic

All 54 theorems in this repository's specs use `linear_arithmetic` (48) or `reflexivity` (6); none uses `decide`.
`linear_arithmetic` is rendered as `simp only […]`, `split`, `omega`, which only Lean's elaborator can run. A proof
form whose rendering is a closed term over a checked library function (reflection: `check certificate = true` closed
by `Eq.refl`) would let a kernel alone carry a proof. This is the "certificate-checked claims" direction already
open upstream; this experiment adds the measurement that a kernel alone runs in a tab in 50 to 460 ms a theorem.
It does not remove the need for an elaborator: definitions and statements still have to become kernel terms.

## nanoda_lib

### 5. A reader-in entry point

`parser::parse_export_file` is `pub(crate)`; the public ways in are a file path or standard input
(`Config::to_export_file`). To run in a browser the export therefore goes through a WASI `fd_read`. Request: make
`parse_export_file<R: BufRead>(reader, config)` public. The module would then import nothing at all.

### 6. A single-threaded public check that returns an error

`check_all_declars` always spawns a thread (`src/tc.rs`), which `wasm32` targets without threads cannot do;
`check_all_declars_serial` is `pub(crate)`. A refusal is a `panic!`, so in WebAssembly it is a trap and the instance
is lost. Request: make the serial check public, and return `Result` from it. The wrapper here loops over
`check_declar` itself and reads the panic message from a hook.

### 7. Definitions of `partial` safety

`src/parser.rs` asserts that no definition is `partial` or `unsafe`. lean4export (without `--export-unsafe`) still
emits `"safety":"partial"` definitions: the compiler's `_unsafe_rec` copies of recursive functions, 16 in LexLean's
runtime library. Lean's kernel checks them; nanoda aborts on the first. Request: check them as Lean does, or skip
them by an option that says so in the result. Until then an export must leave them out of its roots.

## lean4export

### 8. A v4.32.1 tag, and an option to leave out `partial` definitions

There is a tag for v4.32.0 and v4.32.2, none for v4.32.1; v4.32.2 builds unchanged with the 4.32.1 toolchain. An
option `--no-partial` (or documenting that `partial` definitions are exported by default) would settle request 7
from the other side.

## Lean

### 9. A WebAssembly build of the elaborator for a pinned release

Proof terms for a new or edited spec can only come from Lean's elaborator. Lean 4.32.1 has no WebAssembly build:
the release has four assets (darwin, linux, linux_aarch64, windows). The survey for this experiment found that the
last official `linux_wasm32` asset was v4.15.0, that RFC leanprover/lean4#16134 proposes to bring the build back as
a test job without a release asset, and that community builds exist for other versions; those findings were read
through a summarising tool and are not verified here. What Foundry would need: `lean` for `wasm32`, single-threaded
(no `SharedArrayBuffer`), with 32-bit `.olean` files for `Init`, for the exact version LexLean pins.

## PrismPM SDK

### 10. Carry the checker and the library export as inventory

When requests 1 and 5 to 7 exist: publish the kernel checker (`.wasm`) and the library export as inventory items
with digests in `prismpm.lock`, so that Foundry carries no Rust and its gate is one comparison of addresses.
