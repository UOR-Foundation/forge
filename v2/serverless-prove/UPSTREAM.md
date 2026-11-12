# Upstream requests from the serverless-prove experiment

None is filed. Each is written to be filed as it stands. Evidence for each is in `REPORT.md` and `evidence/`.

Versions:

- PrismPM `35e9f01d`, with LexLean 0.3.0 vendored
- Lean 4.32.1 `f054605a`
- lean4export `86e4a339`
- nanoda_lib `0da9f98f`
- SDK image `prismpm-sdk-candidate@sha256:cd3b47d7…`

The predecessor's requests in `v2/in-tab-prove/UPSTREAM.md` still stand: 1 (keep proof terms, publish exports),
3 (library proofs per compiler-semantics ID), and 5 to 7 (nanoda). They are referred to below and not repeated.

## LexLean

### 1. Emit the kernel terms of what a spec states, without the elaborator

**Problem.** Only Lean's elaborator decides what a spec's theorem states and what its definitions compute, so a
proof checked anywhere else cannot be tied to the spec. #354 shows the consequence: an artifact for `answer = 41`
filed under the key of `answer = 42` passes digest and replay.

**Request.** A deterministic back end that emits, from the linked IR, three kinds of kernel term:

1. **Each theorem's statement:** `∀ params, lhs = rhs`.
2. **Each definition's defining equations:** one per clause. For structural recursion, split by constructor on every
   argument of a recursive type.
3. **Each structure's and inductive's constructor types.**

The vocabulary should be closed and fixed per compiler-semantics ID:

| Construct | Term |
| --- | --- |
| `if` | `ite (c = true)` with `instDecidableEqBool` |
| `=?` | `Nat.beq` |
| `&&` | `Bool.and` |
| `+` | `HAdd.hAdd` through `instHAdd`/`instAddNat` |
| `match` | `T.rec` with a constant motive |
| `project` | `Expr.proj` |
| `record` | `S.mk` |
| primitives | their runtime functions with explicit instances |

Anything else is a typed refusal.

**Output.** lean4export NDJSON lines continuing a given export, or LexLean's own core node format. `src/backend/core_v2.rs`
already turns that format into `Lean.Expr` and `addDecl`. The emitter should be available in the check-only
WebAssembly build (#494, #495).

**Evidence.** A stand-in (`emit.mjs`, about 400 lines) did this for the data form.

- Its terms were definitionally equal to the SDK image's elaboration for all 7 theorems and 15 equations of
  `guests` and `payment`. nanoda and Lean 4.32.1's own kernel each accepted them on the same bytes.
- It states all 35 theorems and 82 equations of the four corpora with a data form here.
- Bound this way, a bundle that redefines `breaksEmpty := false` while keeping the declared axioms is refused at the
  equation. Without the equations it would be accepted (`evidence/defects.json`).
- The emitted terms make an elaborator unnecessary for meaning. The elaborator becomes a proof searcher whose
  output the kernel checks.

### 2. Publish a project's proof bundle as a suffix of a pinned library export

**Request.** In addition to request 1 of `v2/in-tab-prove/UPSTREAM.md`, publish two exports:

1. **The runtime library's export.** Once per compiler-semantics ID, with its SHA-256. Include every constant of the
   emitter's vocabulary in its roots, so that every term the emitter writes refers only to the library or to the
   project.
2. **Each verified project's export.** Exactly the library export followed by the project's own declarations, with
   the SHA-256 of that suffix in the attestation.

**Measured.**

- The library is 25.7 MB (4.06 MB gzip). It was byte-identical across two projects.
- The project suffixes were 527 and 510 KB (77 and 73 KB gzip).
- A tab admits a suffix in 9 to 16 ms.

### 3. Key each theorem's proof by what it states, including its closure

**Request.** Compute in `check` a per-theorem key. Each field is framed by length and the whole is tagged:

- the toolchain (compiler-semantics ID, Lean commit, library export address);
- the theorem's canonical linked IR (statement, proof form, axioms);
- the canonical IR of every definition and type its statement reaches, ordered by name.

Write the key into the attestation beside each theorem.

This is what #354's "per-declaration digests" needs on the source side, and it makes #355's content-keyed reuse
exact. An edit re-keys exactly the theorems it touched. `records.mjs` computes it from the data form in under a
millisecond.

### 4. Make `reflexivity` a closed term

`reflexivity` renders as `rfl`. When the statement's left side reduces to its right side, the proof is
`fun params => Eq.refl lhs`, with no tactic.

Request: emit that term directly in the data form or the core format. A kernel alone can then close the theorem,
anywhere.

In the tab here, the 2 reflexivity theorems of guests, 2 edited variants and all 15 definition equations of guests and
payment were closed this way. Every true one was accepted, and the planted false one (the image's own fault spec) was
refused, with the same verdicts as the image.

### 5. `linear_arithmetic` fails on Boolean structure

Writing this experiment's spec, Lean rejected (LLV7002, "omega could not prove the goal") proofs whose statements are
propositional tautologies, in four cases:

- a structure field or parameter of type `Bool` used as a condition or premise;
- an `if` whose condition contains another `if`;
- a `match` on `Option` in a definition the theorem unfolds;
- a statement of the form `wordOf (verdictCode e) = 0`, where both functions are `if` chains.

Each passed once restated over `Nat` flags compared with `=? 1`, or with the inner function taken as a parameter. The
probable cause: `omega` ignores atoms such as `b = true`, and `split` does not split an `if` that appears in a
hypothesis.

Request: add `Bool.eq_false_iff`, `Bool.not_eq_true`, `decide`-normalisation or `simp_all` before `omega`, or a
`boolean_case` step. The failing drafts can be reconstructed from the history of
`v2/serverless-prove/spec/src/`.

## Lean

### 6. Pin a Lean with the fix for #14576

Lean 4.32.1, the version LexLean pins, predates the fix for leanprover/lean4#14576. That issue is an axiom-free proof
of False through wrong-structure projections. PR #14577 fixed it, backported to v4.33.1 and included from
v4.34.0-rc1.

Today's "proved" therefore rests on a kernel with a known hole. Request to PrismPM and LexLean: move the pin to 4.33.1
or later.

### 7. A single-threaded WebAssembly build of the kernel that reads export files

**Problem.** `src/CMakeLists.txt` at v4.32.1 hard-codes `-pthread` for Emscripten, and the WebAssembly CI job is
commented out. The only browser build available (a 4.33.0-pre fork) needs `SharedArrayBuffer` and cross-origin
isolation, and is 19.9 MB brotli.

**Request.** Support RFC #16134 with a target that has `LEAN_MULTI_THREAD` off. It would build the C++ kernel, the
runtime, and the Lean modules the kernel calls into (about 75 `@[export]` functions in `Lean.Environment`,
`Lean.Expr`, `Lean.Level`, `Lean.Declaration` and `Lean.LocalContext`), plus the lean-kernel-arena's "official" export
reader. No elaborator.

**Evidence.**

- That reader, rebuilt here against 4.32.1 with `Environment.replay`, judged the tab's exact inputs in 7.5 to 11.5 s
  natively (`official/`, `evidence/lean-kernel.json`).
- Its verdicts matched nanoda's on all 14 inputs.

With such a build, a tab's "proved" would be Lean's own judgement with no attester.

## lean-kernel-arena

### 8. Publish the official checker per Lean release

The official checker builds against `master` of lean4export at the arena's current Lean version (v4.34.1). Against
4.32.1 it does not compile: `Kernel.Environment.replay` does not exist there.

Request: tag a build per Lean release, so a downstream project pinned to a release can run Lean's own kernel on an
export without patching.

## nanoda_lib

Requests 5 to 7 of `v2/in-tab-prove/UPSTREAM.md` stand. They cover a reader entry point, a serial check that returns
`Result`, and `partial` definitions.

New request: a public check of one declaration against an environment that is kept between calls. A tab could then
keep the library's environment alive and check only a project's suffix and bindings. Today every check re-reads the
26 MB export. The kernel run takes 0.42 s of the 0.54 s a warm project check takes; how much of that is reading was
not measured.

## PrismPM SDK

### 9. Carry the library export, the checker and Lean's export checker as inventory

When requests 2 and 7 exist: pin in `prismpm.lock` the library export, the WebAssembly checker or checkers, and the
native official checker, each by digest.

`verify` could then also run Lean's kernel over the exact bytes a tab will check, and attest them. That attestation
is what promotes "kernel-checked" to "proved" in a tab today.

## Hologram

### 10. Memo keys that name the tool, with framed parts

The memo maps input addresses to output addresses. Its key has no tool identity, and derived labels concatenate
parts without length.

Request:

- the key preimage is `tag ‖ framed(tool address) ‖ framed(input addresses…)`;
- a stored output is re-derived, or carries a verifiable attestation, before it is returned.

`records.mjs` and `v2/reuse/src/Address.lex.tex` show the form. The theorems `anotherToolchainRefused` and
`storedResultFailingItsCheckIsNeverBelieved` in `spec/` state what it buys.

### 11. A verifier for attestations, and SHA-256 as the browser default axis

Hologram has attestation formats but no verifier. Request: a verifier that checks an attestation's subject address,
tool address and signer, so that "Lean's kernel accepted bytes X" can be checked rather than trusted.

In a browser, SHA-256 is native at about 1 GB/s and script BLAKE3 runs at about 27 MB/s. Request: SHA-256 as the
default axis for browser-side verification.

### 12. `.holo` as the carrier

A `.holo` archive with its BLAKE3 footer could carry, each entry by address:

- the pinned library export;
- the checker;
- a project's bundle;
- its records.

Request: per-entry addresses in the archive index, so a tab can verify and cache entries separately and fetch only
the bundles it needs.
