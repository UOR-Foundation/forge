# Lean kernels that could run in a browser tab

**Answer.** No existing Lean 4 kernel is both proved correct and fast enough for a tab. The leanest proven-in-practice
choice is still nanoda: this branch measured it in a browser worker, it uses the least memory in the arena, and it
wrongly accepted none of the arena's invalid inputs. kefir and logos-kernel are the two candidates worth measuring
next. Lean's own kernel has no browser build without threads. metalean is the only checker with a soundness proof,
but it is slow, incomplete, and written in Lean, so it would need the Lean runtime as WebAssembly.

## Sources

The survey report, with a URL for every claim, is in the shared notes folder: `browser-kernels-survey.md`. Each
claim there is marked as fetched directly or as secondhand.

- **Arena figures** come from https://arena.lean-lang.org/results.json (arena rev `6c2d8216`, run of 2026-11-11).
  The run covered 36 checkers on 252 tests, 84 of them invalid inputs.
- **Arena build recipes** come from `github.com/leanprover/lean-kernel-arena/checkers/*.yaml`.
- **Metalean's claims** are from its README (github.com/intgrah/metalean). It was not built here.
- **This branch measured nanoda only.** No other checker was built, because building third-party code was not
  approved in this session.

## Candidates

**Time and memory** are wall time and peak memory on the arena's init-prelude export (3.6 MB), native unless the row
says WebAssembly. **False accepts** counts the arena's 84 invalid inputs that the checker accepted. **Browser** says
what a tab would need.

| Checker | Language, licence | Time / memory | False accepts | Browser |
| --- | --- | --- | --- | --- |
| **nanoda** (ammkrn/nanoda_lib) | Rust, Apache-2.0 | 0.045 s / 8 MiB | 0 | **Measured here.** Builds as wasm32-wasip1 unmodified: 835 KB raw, 252 KB gzip. A project with the library admitted checks in 0.42 s (`REPORT.md`). |
| **kefir** (dmitrykorolev/kefir) | Rust, Apache-2.0 | 0.078 s / 13 MiB. Leanest on the 18 MB reachability test: 4.3 s / 354 MiB | 0 | Has a maintained `wasm32-wasip1` build, which the arena runs under Node: 0.30 s / 114 MiB. It reserves 2 GiB of initial memory and a 256 MiB stack; both must be lowered for a phone. Size not published. |
| **logos-kernel** (LOGOS) | Rust | 0.033 s / 27 MiB, the fastest single thread. Uses 3.6 GiB on large inputs | 0 | Not built for wasm. The core has few dependencies, but the arena driver forks processes, so it may need a single-process path. |
| **pestka** (jasisz/pestka) | Aver, compiled to wasm-gc | WebAssembly build: 0.55 s / 403 MiB under Node. Native: 0.058 s | 0 | About 0.4 MB, the smallest. Needs WebAssembly GC. **The repository has no licence, so it cannot be shipped.** |
| **nano-lean** (sdiehl/nano-lean) | Rust | 0.024 s / 163 MiB | 0 | Uses threads, mimalloc and memmap2. Has the best design for incremental checking (see below). |
| **palladium**, **sokonanoda** | Rust | — | 0 | Plausible wasm targets. Not tried. |
| **official** (Lean's C++ kernel) | Lean / C++ | 7.5 to 11.5 s per project input here, natively | 0 | No browser build without threads. The upstream Emscripten build hard-codes `-pthread`; see section 3. |
| **lean4lean** | Lean | — | 0 | Needs the Lean runtime. Its README calls it "not really an independent implementation". |
| **metalean** (intgrah/metalean) | Lean, toolchain v4.36.0-rc2 | — | 4 for the fast checker, 3 for the logical one | **The only proof-carrying checker.** See below. |
| Ix, Yatima | Lean | — | — | Content-addressed, aimed at zero-knowledge proofs. Neither reads lean4export. Yatima has been dormant since 2024; Ix's Rust kernel was removed. |

## Metalean: the formally verified candidate

The README claims a lot, and none of it was checked here.

**What it says is proved:**

- The "logical" checker is **positively sound**: if it accepts, the declaration is derivable in an idealised version
  of Lean's type theory.
- A set-theoretic model shows that type theory consistent, with propext, `Quot.sound` and `Classical.choice`.

**Where it falls short:**

- **The proof does not cover the fast checker.** The logical checker is "EXTREMELY slow" and has no Nat or String
  literals. The fast checker is related to it only extrinsically and uses `unsafe` / `implemented_by`. Only the
  logical checker carries the proof.
- **It has no nested inductives.** An arena filter drops them, so the checker can wrongly accept: 3 or 4 false
  accepts in the arena.
- **It is partial:** it may not terminate.
- **It needs the Lean runtime in a browser.** It is written in Lean, so running in a tab needs a WebAssembly build of
  the Lean runtime. That runtime exists only with threads today, though a single-threaded build has been reported:
  PR #13233 fixed the lock stub and was merged 2026-04-07.

**What it would change for this design.** The `independentKernelAgrees` assumption in `spec/src/Trust.lex.tex` would
become a theorem, for the fragment metalean covers.

**When it becomes the design's first key:** when its logical checker covers literals and nested inductives, and the
Lean runtime builds as single-threaded WebAssembly.

## Incremental checking and compact input

No checker keeps an environment alive in memory between checks. That is the main latency win left: today every
check re-reads the 26 MB library, which is most of the 0.42 s.

- **nano-lean** comes closest. It reads blean, a binary form of lean4export. It caches accepted declarations under
  closure-hash keys (`--cache FILE.accepted`), and it can check one module against its imports' interfaces. The
  cache lives in a file, not in memory.
- **Susz**, from pestka's author, is a binary export format about 10 times smaller than NDJSON. No checker reads it
  yet.

Both point at the same next step for the tab:

1. Keep the pinned library resident in the kernel's memory.
2. Check only a project's suffix and the tab's bindings.
3. Key accepted declarations by closure hash, as `records.mjs` already keys theorems.

## Browser state of Lean itself

- **No official WebAssembly asset since v4.15.0.**
- **RFC lean4#16134** (open, no comments) asks for a non-gating WebAssembly CI job.
- **PR #16149** (open) shrinks the JavaScript glue file from 113 MB to 201 KB, startup from 236 s to 5 s, and memory
  from 5.3 GB to 1.5 GB. The `lean.wasm` binary itself stays large.
- **lean.cau.li** (cauli/lean4-wasm-in-browser, Apache-2.0, built from the `reinstate-wasm` fork) runs Lean in a tab,
  but needs COOP and COEP headers and shared memory.
- **live.lean-lang.org** runs Lean on a server.

## Recommendation

1. **Keep nanoda as the tab's checker now.** It is the leanest, it is measured, and it falsely accepted nothing.
2. **Measure kefir and logos-kernel in the same bench, on the same inputs.**
   - kefir: lower `wasm_layout.rs` to 64 MiB of initial memory and a 32 MiB stack first.
   - logos-kernel: needs a single-process build first.
   - Both must agree with Lean's kernel on the planted faults in `agree.mjs`.
   - Adopt one only if it beats nanoda on time without using more memory than a phone can give.
3. **Add a resident-library mode to whichever checker wins.** Request it from nanoda upstream (`UPSTREAM.md`) or write
   a wrapper. Expected effect: a project check falls from about 0.4 s to the cost of the suffix alone. That is an
   estimate, not measured.
4. **Track metalean as the route to "100% formally verified" checking.** Do not ship it yet.
