# "Proved", in the tab

No checker here accepted a planted false statement or a broken proof.

Answer: possible with named upstream work, not possible today. "Proved" is two jobs. Making the proof needs Lean's
elaborator, and no WebAssembly build of Lean 4.32.1 exists. Judging the proof needs only a kernel, and that half runs
in a tab today: an 835 KB module (252 KB gzip) checks one theorem with everything it depends on in 37 to 358 ms
median, and every declaration of a project in 0.6 s once the runtime library is admitted by address (6.5 s without),
in a plain worker with no cross-origin isolation. The kernel is nanoda, an independent checker, not Lean's own, and it
cannot tell whether the statement it checked is the one the spec wrote. So the tab's verdict is named
"kernel-checked", never "proved".

Everything is an experiment under `v2/in-tab-prove/`. Nothing else was edited, pushed or filed.

## 1. What "proved" is today

`lexlean verify` (LexLean 0.3.0, PrismPM `35e9f01d`, `src/verify/mod.rs`) is one fixed pipeline with no optional
stage. Every Lean process is `lake env <tool>` from the pinned toolchain with the staged `.olean` root on `LEAN_PATH`.
Lake builds nothing.

| Stage | What runs | Consumes | Produces | payment | guests |
| --- | --- | --- | --- | --- | --- |
| 1 to 3, render | LexLean itself | the spec | generated `.lean` per module, the runtime library's sources, source audit of both | under 1 s | under 1 s |
| 4 to 5, preflight | `lean --version`, `lake --version`, digests | toolchain | the exact version and executable hashes | 0.8 s | 0.4 s |
| identity | `leanchecker` on a module that does not exist | | `leanchecker`'s recorded identity | 1.6 s | 0.9 s |
| 6, probe | `lean` on a probe file | | the external interface the code relies on | 4.6 s | 1.7 s |
| 7, elaboration | `lean -o M.olean M.lean`, one process a module, import order | generated Lean | `.olean`, `.olean.private`, `.olean.server`; Lean's kernel accepts each declaration as it is added | 79.0 s (library 66.6, project 10.0) | 56.7 s (library 51.8, project 3.7) |
| 8, replay | `leanchecker M`, one process a module | the `.olean` parts | exit 0: Lean's kernel re-accepted every declaration from the file | 62.1 s (library 35.8) | 17.6 s (library 4.2) |
| 9 to 10, audit | `lean` on a file of `#print axioms`, one a module | the `.olean` | the axioms each declaration depends on, parsed exactly | 16.1 s | 3.0 s |
| 11, policy | LexLean | observed axioms, the spec's `axioms:` | refusal unless they are equal (`LLV7005`) | 1 ms | 1 ms |
| 12 to 16 | LexLean | all of it | no absolute paths, the attestation, atomic publication. The private `.olean` parts and library sources are deleted | 0.2 s | 0.4 s |
| whole | | | attestation `0a828680…` / `7bcc2dd9…`, status `verified` | 164.8 s | 80.7 s |

Measured with LexLean's own telemetry (`LEXLEAN_CI_TELEMETRY`) in the pinned image; raw events in
`evidence/*-telemetry.jsonl`. `payment` is `v2/probe-payment`; `guests` is `v2/loop/answers/guests-3.verified.lex.tex`,
the form of `corpus/guests-3` that Lean proved (the corpus file itself is refused at check). The machine was busy:
the same payment run took 82 s an hour earlier, with the same attestation ID three times. Peak memory of one process:
0.8 GB elaborating, 1.4 GB replaying.

For the author's own module the costs are small: 1.0 to 1.5 s to elaborate, 2.5 to 8.0 s to replay, 0.6 to 0.7 s to
audit. Three quarters of a run is the runtime library, which is the same bytes for every project.

Which stage carries the trust. Three, and they are not interchangeable:

- Elaboration decides what is being claimed. It turns the generated text into the kernel terms of every definition
  and statement, and it runs the tactics (`simp only`, `split`, `omega`, `rfl`) that produce the proof terms.
- The kernel decides whether a proof term proves its statement. It runs twice: inside `lean`, and again in
  `leanchecker`. The replay exists because code running inside `lean` can put a declaration into the environment
  without the kernel. Shown here: `faults/Hacked.lean` does that, `lean` exits 0, `leanchecker` refuses it.
- The axiom audit and policy decide what was assumed. The kernel accepts `sorry`, since it is an axiom. Shown here:
  `faults/Sorry.lean` passes `lean` and `leanchecker`; only the audit names `sorryAx`.

## 2. The routes

| Route | Needs from upstream | Foundry carries | Download, time | The user trusts | Risk | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| (a) Lean itself as WebAssembly | A build of `lean` 4.32.1 for wasm32 with 32-bit `.olean` files. None exists: the release has four assets, none wasm | A loader, a file host, the bytes | Community build of another version: 33 MB transferred, ready in under 30 s, a small `omega` proof in about 0.25 s (one probe, below) | Lean, as today. This is the same judgement | Memory: native `lean` peaks at 0.4 to 0.8 GB on these modules. The one build tried needs cross-origin isolation | Not built. The only route that makes proofs in a tab |
| (b) Elaborate elsewhere, check in the tab | For shipping: LexLean keeps the proof terms (request 1). For this experiment: nothing | 3.8 KB of script, a 252 KB checker, exports | See section 4 | An independent kernel, plus the elaborating host for what the statement is | The statement is not bound to the spec | Built and measured. Chosen |
| (c) Library admitted by address | The library's export published once per compiler-semantics ID (request 3) | The address and the count | Whole project 0.6 s instead of 6.5 s | That the library bytes at that address were fully checked once | Small: the tab can do the full check itself, 6.5 s, once | Built on top of (b) |
| (d) Decidable fragment by computation | A proof form that is a closed term (request 4) | | | | | Not worth building: 0 of 54 theorems are `decide`; 48 are `linear_arithmetic`, 6 `reflexivity`. And a statement still has to be elaborated |
| (e) LexLean emits kernel terms itself | A second back end in LexLean: definitions, matches, recursion, statements as terms | | | LexLean in place of Lean's elaborator | A large change, and proofs still need a tactic engine | Not built; listed for completeness |

Survey of checkers for route (b). Read directly: lean4export `86e4a339` (tag v4.32.2; no v4.32.1 tag) builds
unchanged with the 4.32.1 toolchain, format 3.1.0, NDJSON. nanoda_lib `0da9f98f` (0.4.32, Rust, Apache-2.0, last
commit 2026-11-07) has no native dependency and compiled for `wasm32-wasip1` unmodified. `leanchecker` is Lean's own
kernel replaying an `.olean`, by LexLean's source comment "not an independent verifier". From a survey agent that read
pages through a summarising tool, not verified here: a public "Lean Kernel Arena" scores about 36 checkers against the
official kernel; nanoda, lean4lean and kefir score at or near the official kernel's results; kefir already has a
`wasm32-wasip1` entry there (Init in 25.6 s); two nanoda soundness bugs were found and fixed in 2026; the arena
recommends no checker; the last official Lean wasm asset was v4.15.0 and an RFC (lean4#16134) proposes bringing the
build back without a release asset.

Why (b) with nanoda: it is the half that can be measured today, it is someone else's established checker and not one
written here, and it compiled without a patch. kefir was not tried.

The probe for route (a). `https://lean.cau.li` (a community fork) reported `Lean (version 4.33.0-pre,
wasm32-unknown-emscripten)`, transferred 33.2 MB in five packs, and elaborated a structure, a definition and a theorem
closed by `simp only […]; split; omega` in about 250 ms, printing `depends on axioms: [propext, Quot.sound]`. That
page is cross-origin isolated with `SharedArrayBuffer` present. It is another version from a fork: it shows the route
is real, and it is not the pinned judgement. One run, timed by a page observer.

## 3. What was built

- `crate/`: nanoda_lib behind four exports. No typing rule. One option that is not a rule: the first N declarations
  are entered without being checked again.
- `kernel.mjs`: the host. Answers the eleven WASI calls the module imports (the export is standard input; there is
  no file, clock or socket), refuses other bytes by address, and `judge` adds the two conditions a kernel cannot:
  the theorem asked about is among those checked, and the export's axioms equal the declared list.
- `worker.mjs`, `bench.html`, `serve.mjs`, `manifest.json`, `make-manifest.mjs`, `test.mjs`.
- `capture-staging.sh`: `verify` deletes the proof terms before publishing, so this copies the staging tree during
  the replay stage of a run in the image. The nine public `.olean` files of the copy equal the attestation's digests.
  The export is therefore a reading of the image's own elaboration, not a second one.
- `make-exports.sh`, `export.sh`: one export per theorem (the theorem and its dependency closure), one per project
  (every attested declaration), and the runtime library alone.
- `kernel-faults.sh`, `spec-faults.sh`, `faults/`: the planted faults and the image's verdicts on them.

Found on the way:

1. `nanoda_lib::parser::parse_export_file` is private and `check_all_declars` always spawns a thread. The wrapper
   uses nanoda's standard-input path and loops over the public `check_declar`.
2. nanoda refuses by panicking, so a refusal is a trap. A hook leaves the message; each check gets a new instance.
3. nanoda aborts on any definition of `partial` safety. The runtime library has 16, the compiler's `_unsafe_rec`
   copies. They are left out of the export's roots. Lean's kernel checks them; nothing safe may refer to them.
4. The runtime library's export is 25.7 MB of each 26.3 MB project export, byte-identical between the two projects,
   and a strict prefix of both when its roots are exported first.

## 4. Measurements

Claude desktop in-app browser (Chrome 156, Windows 11), dedicated module worker, 12 runs, each a new worker. Served
with no COOP or COEP header: `crossOriginIsolated` false, `SharedArrayBuffer` undefined. The pane was hidden and other
sessions were building, so these are pessimistic. Full figures in `measurements.json`.

| Measure | Value |
| --- | --- |
| Checker, raw / gzip / brotli | 835 / 252 / 189 KB |
| Scripts (host and worker), gzip | 3.8 KB |
| First visit, fetch to ready | 125 ms (localhost) |
| Return visit, bytes in the Cache API to ready, median / worst | 35 / 396 ms, of which hash, compile and first instance 9 / 15 ms |

| Export | Raw / gzip | Declarations (theorems) | Check, median / worst | Linear memory |
| --- | --- | --- | --- | --- |
| guests `startsEmpty` (reflexivity) | 535 / 83 KB | 354 (48) | 37 / 64 ms | 35 MB |
| payment `viewKeepsRevision` | 595 / 91 KB | 399 (52) | 44 / 76 ms | 35 MB |
| payment `clearAdvances` | 584 / 91 KB | 390 (65) | 95 / 167 ms | 35 MB |
| guests `staleIgnored` (largest) | 4.1 MB / 657 KB | 1,499 (642) | 358 / 634 ms | 43 MB |
| payment, whole project | 26.3 / 4.1 MB | 5,303 (2,709) | 6,617 / 8,848 ms | 125 MB |
| guests, whole project | 26.3 / 4.1 MB | 5,248 (2,725) | 6,254 / 8,971 ms | 125 MB |
| payment, library admitted by address | the same | 262 checked | 581 / 775 ms | |
| guests, library admitted by address | the same | 207 checked | 607 / 904 ms | |

Hashing an export took 0.7 to 27 ms; reading one back from the Cache API 2 to 22 ms (worst 683 ms, once). The page's
round trip is 1 to 30 ms above the time in the worker. 35 MB is nanoda's 32 MB stack plus the module.

Against the authority's own cost for the same judgement on the author's module: `leanchecker` 2.5 to 8.0 s and
1.3 GB; the tab 0.6 s and 125 MB.

Not measured: the host-side export. One `lean4export` run took 58 s on the busy machine; it was not optimised.

## 5. Agreement with the authority

Authority: `lexlean verify` in `prismpm-sdk-candidate@sha256:cd3b47d7…`, Lean 4.32.1 `f054605a`.

| Case | Image | Tab |
| --- | --- | --- |
| payment: 2 theorems | verified, each `[propext]` | kernel-checked, each `[propext]` |
| guests: 5 theorems | verified; 2 with no axioms, 3 `[Quot.sound, propext]` | kernel-checked, the same axioms |
| payment: all 424 attested declarations and their closure, 5,303 | verified | accepted |
| guests: 5,248 | verified | accepted |
| true control (`faults/True.lean`) | `lean` 0, `leanchecker` 0, `[propext]` | kernel-checked |
| false statement closed by `sorry` | `lean` 0 with a warning, `leanchecker` 0, audit `[sorryAx]`: refused by policy | refused: `depends on sorryAx which was not found` |
| false statement entered with the kernel off | `lean` 0, `leanchecker` 1: `declaration type mismatch` | refused: `def_eq` fails |
| spec: false statement (`+ 2`) | refused, `LLV7002` | no export exists |
| spec: broken proof (wrong definition unfolded) | refused, `LLV7002` | no export exists |
| spec: true theorem, axioms declared `[]` | refused, `LLV7005` | no export exists; the same rule refuses in the tab (tested) |
| spec: false statement by reflexivity | refused, `LLV7002` | no export exists |

Faults planted in the export itself, tab only: a theorem's statement swapped for another's, its proof swapped for
another's, the theorem removed, the theorem admitted unchecked, a truncated export, an undeclared axiom, a declared
axiom that is not used. All refused.

Where the two judgements differ, plainly:

1. The four spec-level faults never reach the tab. They are refused where the proof is made. The tab's part in
   them is nil.
2. The kernel is nanoda, not Lean's. Agreement was shown on 5,510 distinct accepted declarations and three kernel
   level cases, which is evidence and not a proof of sameness.
3. 16 `partial` definitions the image replays are not checked in the tab.
4. The exact-axioms rule was applied to the seven theorems. The image applies it to every declaration.
5. The tab does not know that the checked statement is the spec's. See section 6.

## 6. Security

What the user trusts on route (b). The checker's bytes, pinned by sha256 in `manifest.json` and refused on mismatch
before compiling (`ITP_ADDRESS`); nanoda's implementation of Lean's type theory; the three permitted axioms; and the
host that elaborated, for one thing only: that the definitions and statements in the export are what the spec says.
A host cannot make the tab accept a proof that does not prove its statement. It can hand over a correct proof of a
different statement under the same name. Nothing in a tab can see that without an elaborator. Three partial answers:
show the user the statement that was checked, printed from the checked term (nanoda has a printer; not wired); bind
statements in the attestation (request 2); or have several independent hosts agree on the export's address, since
elaboration is deterministic (the library export was byte-identical across two projects).

What the user trusts on route (a): Lean and LexLean, as today, plus the bytes' address. Nothing else.

Where it runs. A dedicated worker whose script carries `connect-src 'none'`: measured, a fetch to its own origin and
to another are both refused. The module imports eleven WASI calls, all answered from memory; a module importing
anything else is refused by name (`ITP_IMPORT`, tested). A result is a function of the checker's bytes, the export's
bytes and the options: two instances give equal results (tested).

Admitting the library. Only as bytes: the export must begin with exactly the bytes whose address the manifest names,
and the count of declarations comes from a full check of those bytes. The tab can run that full check itself.

Pinning follows `v2/in-tab-check/`: sha256 labels, verify before use, bytes held in the Cache API under their
address. As there, the address proves which bytes, not who made the manifest; nobody signs it.

## 7. Any browser

| Route | Needs | Missing where |
| --- | --- | --- |
| (b), (c) | Core WebAssembly with the features Rust 1.97 enables by default, a worker, `crypto.subtle` (so HTTPS), the Cache API. No threads, no `SharedArrayBuffer`, no isolation headers, no 64-bit memory | Nowhere known among current engines. Not tested outside Chromium |
| (a), from the one build probed | The same, plus cross-origin isolation on that build, plus several hundred MB of memory | A static host that cannot set headers needs a service-worker shim. Memory on phones is the open risk |

Risks that only another engine can settle: nanoda recurses on the engine's call stack, and engines differ in depth,
so a deep proof could trap in Safari where it passes in Chrome (a trap is a refusal, never an acceptance); a 26 MB
export with 125 MB of memory on a phone. Could not test: Firefox, Safari, any phone, any real network. Only Chromium
can be driven here.

## 8. What it would take to ship

For the kernel check as a second, independent opinion beside the hosted verdict:

1. LexLean publishes exports with the verified set and binds statements (requests 1, 2). Capturing a staging tree
   mid-run is an experiment's trick, not a pipeline.
2. nanoda takes requests 5 to 7, or the wrapper stays as it is: it needs no patch today.
3. The SDK carries the checker and the library export as inventory (request 10).
4. Wiring into the app and the service worker; none was touched.
5. The product's words: "kernel-checked in your browser" beside "proved by Lean (hosted)". Not one word for both.

For "proved" with no server: a WebAssembly build of the elaborator at the version LexLean pins (request 9), or
LexLean pinned to a version that has one. Then measure download, memory and time for the runtime library, which
costs 52 to 67 s natively and would have to ship pre-elaborated.

## 9. Planted defects

Each restored; `node --test v2/in-tab-prove/test.mjs` then passed 14 of 14.

| Defect | Caught by | Result |
| --- | --- | --- |
| The checker skips theorems (wrapper rebuilt) | the address check: the suite stops at `ITP_ADDRESS` | with its own address accepted: tests 9 and 11 fail, the hacked theorem and both swaps are accepted |
| The theorem need not be among the checked declarations | tests 12, 13 | 2 fail |
| The checker's address is not compared | test 2 | 1 fails |
| Axioms need not equal the declared list | test 14 | 1 fails |
| Unread export bytes are ignored | nothing | No test could fail it, because nanoda always reads to the end. The rule was removed rather than kept as an unshown gate |

After the first defect the sound wrapper was rebuilt and reproduced its recorded address.

## 10. Measured, estimated, not established

Measured: sections 1, 4, 5 and 9; the four findings in section 3; the release assets of Lean 4.32.1; the one probe of
a community build; that the worker reaches no network.

Estimated: that a Lean build for the tab would behave like the probed fork at the pinned version; its memory, from
native peaks.

Not established:

- That nanoda and Lean's kernel are the same judgement. Agreement on this corpus only.
- Anything in the survey marked as unverified in section 2.
- Agreement beyond two specs, seven theorems, three kernel-level faults.
- Deep proofs on an engine with a shallower stack; any browser but one; phones; real networks.
- The exact-axioms rule for definitions; the 16 `partial` definitions.
- That the statement checked is the statement written. Not established by design on route (b).
- A build of Lean 4.32.1 for WebAssembly. Not attempted: no supported path at this version, and hours of compile
  on a shared machine with a memory guard.
- Who signs the manifest.
