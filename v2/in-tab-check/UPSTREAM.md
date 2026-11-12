# Upstream requests

Each is written to be a pull request description. None has been filed. Measurements are in `REPORT.md`.

## 1. LexLean: build and run `check` on `wasm32-wasip1`

Repository: UOR-Foundation/LexLean (seen as `vendor/lexlean` 0.3.0 in PrismPM `35e9f01d5415ed4b0b64c152238f291546957ec4`). Patch: `upstream/wasm-check.patch`, 59 lines added and 14 removed in 7 files. It supersedes the `std-fs` request in `studio/UPSTREAM.md`: no feature and no new API are needed.

Why: `lexlean check` then runs in a browser worker over a file system held in memory. Built from this patch, it gives the same verdict, codes, messages, lines and columns as the native binary on 17 files, writes the same lock bytes, and reports the same compiler-semantics ID. A check takes about 50 ms.

What changes, each gated on `target_family = "wasm"` so native code is as before:

1. `Cargo.toml`: `fs4` and `same-file` become dependencies of non-wasm targets. `fs4` does not compile for WASI; `same-file` compiles and refuses at run time.
2. `api.rs` `acquire_lock`: no `lock_exclusive` on wasm. An instance owns its whole file system and runs one command.
3. `project.rs` `all_modules`: no same-file identity on wasm. Stated in a comment: such a host must supply a file system without hard links. Symlinks are still rejected.
4. `link.rs` `check_project` and `backend/core.rs` `on_stack_for`: on wasm without threads, run the work on the one stack. The embedder sizes it at link time (`-zstack-size`), and an overflow traps.
5. `lib.rs` `embedded_digest`: on wasm without threads, read the files on the one thread. The loop body becomes a named closure shared by both paths.
6. `verify/lifeline.rs`: an `end_leader` for hosts that are neither Unix nor Windows. It reports failure; no child is ever started there.

To decide upstream: whether dropping the same-file check on wasm is acceptable, or whether it should use WASI's device and inode once `std::os::wasi::fs::MetadataExt` is stable. And whether deep nesting on wasm should be bounded by a depth the build declares, so it stays `LLS8002` and never a trap.

Tested here: the wasm build against the SDK image on 17 files. Not tested here: the crate's own suite on a native target (it compiles).

## 2. LexLean: a check-only build that does not embed the preservation library

Patch: `upstream/lean-embed.patch` (17 lines, on top of request 1). It is a demonstration of the effect, not the proposed form.

Why: `language/preservation-1.2/library/` is 31 of the 37 MB the crate embeds, and only production export reads it. Yet every process that touches a language-1.2 project reads all of it into its data form to compute the compiler-semantics ID. On wasm that is 0.8 to 1.3 s at start and 124 MB of memory. Without those bytes the checker is 15.1 MB (3.5 MB gzip) instead of 47.4 MB (7.1 MB), ready in 91 ms instead of 942 ms.

Proposed form: a cargo feature, on by default, that embeds the production data. With it off, the bytes are left out and the language-1.1 and 1.2 IDs come from constants checked into the repository, which the existing conformance test (RP-10, recompute from disk) must equal. Production commands then fail with a typed diagnostic.

The demonstration instead takes the ID from an environment variable at build time. Its risk, measured: a build given a wrong ID still agrees with the native binary on every verdict, because it locks and checks with the same value. Only comparing its lock bytes with a native lock catches it. A checked-in constant under RP-10 removes that risk.

Independent of wasm, the same change would let a native process skip the read: the ID is a constant of the build.

## 3. LexLean: a command for a module's data form

`lexlean::identity_bytes` (hidden from documentation) already rewrites a module written in the notation as `\semanticdata{…}`. A preview that interprets a spec needs exactly that JSON. Request: `lexlean data <module>` printing the `lexlean/semantic-module/2` value, or `identity_bytes` as a documented function. Here it takes 1 to 3 ms a module and equals what the hosted service returns for `view: "data"`.

## 4. LexLean: one engine across checks

Each command reloads the project, verifies the lock, reads every lexicon entry and parses its embedded tables. A syntax refusal, which stops before linking, takes 31 ms of a 46 ms check, so about two thirds of a check is that fixed work. Request: a library entry that keeps the loaded lexicon and library modules between checks and re-checks only modules whose source changed, with results equal to a fresh `check`. Estimated effect: 46 ms to about 15 ms. Not measured.

Related, larger: diagnostics for link-phase faults carry the whole module as their span (`LLT4001`, line 8 to the end). A span for the declaration at fault would let an editor point at it; a per-declaration check would let an edit re-check one declaration.

## 5. PrismPM SDK: publish the wasm checker in the inventory

Request: build `lexlean` for `wasm32-wasip1` in the SDK's own lane and list it in the SDK inventory with its digest, as the native `lexlean` binary is (`kind: "binary"`, a sha256 per platform). A browser consumer then pins the checker through `prismpm.lock` like everything else, carries no Rust and no build, and its gate is one comparison of addresses. Until then a consumer must build it itself and can only record what it built.

## 6. Hologram: three gaps a verified tool in a browser meets

Repository: Hologram-Technologies/hologram.

1. A receipt for a deterministic run: the address of the tool, the addresses of its inputs and arguments, the address of its output. The graph memo maps input labels to output labels with no tool identity, and `derive_label` joins labels without framing their lengths. This work keeps results under `sha256(domain ‖ 0 ‖ length ‖ 0 ‖ part …)` with the checker's address as the first part; a shared format would let another tab or another user trust a result it did not compute.
2. A loader that takes a module and an expected address and refuses to instantiate on a mismatch. `boot_userland` validates the import surface and then mints the address; it has no expected one to compare with.
3. A fast hash in the browser. The store's browser binding addresses with BLAKE3 in WebAssembly or script; for a 15 to 47 MB module the browser's own SHA-256 took 18 to 45 ms. The sha256 axis exists in `substrate.rs`; request that the browser store accept it for put and verify.
