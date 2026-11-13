# "Proved" with no server

No planted fault was accepted. 21 cases were tried: 7 real theorems, 4 spec faults, 6 bundle faults and 4 record
faults. Lean 4.32.1's own kernel and the tab's kernel gave the same verdict on every one of the 14 distinct inputs
both judged.

Answer: delivered for a named class. Here is what a plain Chromium tab does today, with no server, no cross-origin
isolation and no threads.

- It judges every theorem of the two real specs against the statement the spec wrote. The checker is an independent
  kernel.
  - Desktop, whole project: 0.46 to 0.54 s median, 0.73 s worst.
  - Phone-size emulation on the same desktop CPU: 0.73 to 0.88 s median, 1.15 s worst.
  - The SDK image takes 80 to 165 s for the same project.
- It makes the proof itself, with no elaborator and no prover, for:
  - the reflexivity form: 6 of the 47 theorem occurrences in the named corpora, shown here on the 2 in guests and
    on the image's false-reflexivity fault;
  - every definition's equations in guests and payment (15 of 15). The emitter states 82 of 82 across the four
    corpora that have a data form.
- An edited theorem gets its verdict in 0.47 s median (0.80 s emulated phone).
- The other 41 occurrences (`linear_arithmetic`) still need Lean's elaborator once, somewhere. That elaborator is
  untrusted: whatever it produces is checked in the tab.

The verdict reads "proved", meaning Lean's own kernel, only when Lean's kernel has accepted the exact bytes the tab
checked. Today that acceptance reaches the tab as an attestation from wherever it ran. A theorem in the spec of this
design, which Lean proved, says what that rests on: the verdict is wrong only if the attester lied **and** the
independent kernel is unsound. Otherwise the tab says "kernel-checked". Lean's own kernel cannot run in a tab today:
there is no WebAssembly build of Lean 4.32.1, and the upstream Emscripten build hard-codes threads.

Everything is under `v2/serverless-prove/` on branch `claude/elegant-noether-efd461`. Nothing was pushed, filed or
deployed.

## 1. What "proved" means here, and what each verdict trusts

**Proved.** Lean 4.32.1's kernel accepts a declaration whose type is the theorem's statement exactly as the spec
wrote it. The environment it is checked in is:

- the pinned library;
- definitions bound to the spec by their defining equations;
- types bound to the spec by their constructor types.

The axioms used must equal the theorem's declared `axioms:` exactly. That is the judgement `lexlean verify` makes, with
one change: the statement and the definitions are fixed by the spec itself, not by whoever elaborated it.

**Kernel-checked.** The same judgement made by nanoda, an independent kernel-level checker, in place of Lean's kernel.
It is never displayed as "proved", and the spec proves that (`kernelCheckedNeverReadsProved`,
`onlyProvedReadsProved`).

**100% formally verified,** used in this report only in this sense: every component that can make a wrong verdict
look right is either proved by Lean, or named below as an assumption.

| Component | `lexlean verify` today (hosted) | Tab, "kernel-checked" | Tab, "proved" |
| --- | --- | --- | --- |
| Whoever runs the check | the server, trusted entirely | the user's own tab | the user's own tab |
| What the statement means | LexLean's renderer, then Lean's elaborator | the emitter writes the terms from the spec, and the kernel checks they are definitionally equal to the elaborated statement | same |
| What a definition computes | the elaborator | the spec's equations, each checked by the kernel against the bundle's definition (A6: equations fix a structurally recursive function) | same |
| Proof search | Lean's tactics, inside the trusted run | anyone, untrusted: a wrong proof is refused | same |
| Kernel | Lean's, twice (`lean`, `leanchecker`) | nanoda 0.4.32 as WebAssembly, in the browser engine (A3, A4) | Lean's kernel on the same bytes, via an attestation (A5), **or** nanoda |
| Library (Init, LexLean runtime) | the toolchain's own build | the same terms, pinned by SHA-256 and checked once in full | same |
| Axiom audit | `#print axioms`, parsed | the transitive closure of constants in the export, computed in the tab | same |
| Hash | — | SHA-256 collision resistance (A1) | same |
| Host code with no proof | LexLean's pipeline | 323 lines in `bind.mjs` and `export.mjs`: prefix check, type comparison, binding assembly, axiom closure. The emitter (A2) and the WASI host add 660 | same |

The named assumptions are fields of `Trust.Assumptions` in the spec:

- **A1:** SHA-256 has no collisions on these inputs.
- **A2:** the emitter states what the spec wrote. This is LexLean's role today, held by a stand-in here.
- **A3:** nanoda accepts only what Lean's kernel accepts.
- **A4:** the WebAssembly engine runs the checker as written.
- **A5:** the attester ran Lean's kernel on the attested bytes.
- **A6:** the equations determine the function.

The spec has no proof of any of these.

A fact the brief did not foresee: Lean 4.32.1's own kernel has a soundness bug. Issue leanprover/lean4#14576 is an
axiom-free proof of False through wrong-structure projections. It was fixed in 4.33.1. The survey read this directly
from the issue and the pull request; it was not reproduced here. So even today's "proved" is only as sound as a
kernel with one known hole, and a second, independent kernel defends against exactly that class of hole.

The three gaps the predecessor left:

1. **The checker was not Lean's kernel.** Partly closed. Lean's own kernel now judges the exact bytes the tab
   judges. It runs natively, with Lean 4.32.1's C++ kernel (`official/`), and its acceptance is what makes a verdict
   "proved". It does not run in a tab: see route (e).
2. **Nothing bound the checked statement to the spec.** Closed. The tab writes the statement, every definition's
   equations and every type's constructors from the spec itself. A bundle that changes any of them is refused by the
   kernel (section 5).
3. **Making a proof still needed the elaborator.** Closed for reflexivity proofs and all definition equations, which
   the tab makes itself. Open for `linear_arithmetic`, where the elaborator, now untrusted, still searches for the
   proof.

## 2. The design: bound proofs

A proof is an untrusted **bundle**: the kernel terms a prover produced, following a pinned library. The tab trusts
none of it. A **record** files a bundle under a **key** the tab computes itself:

```
key = sha256(tag ‖ toolchain ‖ theorem ‖ declaration ‖ closure)
```

Each field is length-framed. The key covers the theorem as the spec writes it (statement, proof form, axioms), every
definition and type it reaches, and the toolchain (Lean's commit, the library's address, the checker's address, the
emitter's version).

To judge a theorem, the tab does seven things:

1. Computes the key from the spec. It uses the record filed under that key only if the record names this key and
   this theorem, and the bundle's bytes hash to the address the record names.
2. Checks that the bundle begins with the pinned library byte for byte, declares no library name again, and declares
   no axiom.
3. Writes its own reading of the spec as kernel terms (`emit.mjs`, from LexLean's data form):
   - the statement;
   - one equation per clause of every definition the statement reaches, split by constructor on every argument of a
     recursive type;
   - the constructor types of every structure and inductive type it reaches.
4. Compares each type's constructors with the bundle's inductive declaration.
5. Declares, after the bundle:
   - `Serverless.eqn.<definition>.<clause>`, proved by `Eq.refl`, which the tab makes;
   - `Serverless.bind.<theorem>`, with the spec's statement as its type. Its proof is the bundle's theorem, or
     `Eq.refl` made in the tab for a reflexivity proof.
6. Runs one kernel over the bundle plus these declarations, with the library admitted by address.
7. Requires the binding's axioms to equal the declared ones.

The verdict is a pure function of what the tab saw, `Verdict.verdictCode`.

Why this works without an elaborator: a definition is conservative, so a bundle may define anything it likes. The
only things that carry meaning are the statement, the definitions it reaches and the types. The statement is the
tab's own term. Each definition is pinned by its equations, and Lean's structural recursion makes each clause hold by
unfolding once its recursive arguments are constructors. Each type is pinned by comparison. The prover's choices
(`match_1` helpers, `brecOn`, instance paths) are invisible to the verdict. They need only be definitionally equal to
the spec's equations, and the kernel decides that.

Hologram's ideas are used where they fit:

- addresses as the unit of reuse;
- a store whose reads are verified;
- a memo from inputs to outputs.

Its gaps are avoided. Keys carry the tool's identity and length-framed fields. A stored result is re-derived before it
is believed. The browser hashes with SHA-256: native, about 1 GB/s, against about 27 MB/s for script BLAKE3.
Hologram's archive could carry the library, checker and bundles; it was not built here (`UPSTREAM.md`).

### The routes, and why this composition

| Route | Needs from upstream | Foundry carries | Desktop / phone | Trusts | Outcome |
| --- | --- | --- | --- | --- | --- |
| (a) Prove once, verify everywhere | A published bundle per project; the library export per compiler-semantics ID | Records, keys | 73 to 77 KB gzip per project; 0.5 s / 0.8 s per project | No prover. Only the library and checker are taken by address | **Adopted.** An address is never taken in place of a kernel check of a proof |
| (b) No elaborator | A kernel-term emitter in LexLean. Its natural home exists: `src/backend/core_v2.rs` already turns JSON node batches into `Lean.Expr` and calls `addDecl` | The stand-in `emit.mjs` until then | Emitting is under 5 ms | A2 | **Adopted** for statements, definitions and types, and for proofs by reflexivity. `linear_arithmetic` renders as `simp only […]; split; omega`; no tactic engine runs in the tab |
| (c) Verified computation | A checker written in LexLean and proved sound | — | — | LexLean's production compiler as well | **Not adopted.** LexLean has no induction tactic to prove a decision procedure sound. A compiled checker would add the production compiler and its certificates to the trusted base. The general certificate checker is the kernel, already in the tab. Decision tables keep `regionCheck_sound` |
| (d) Verified kernel in the tab | — | — | nanoda: 252 KB gzip | See the survey below | **Adopted as the second key.** No candidate has a full correctness proof |
| (e) Lean in WebAssembly | An official single-threaded build at the pinned version | — | 19.9 MB brotli / 137 MB raw in the one build probed, with threads and cross-origin isolation | Lean | **Not available.** It is the only way Lean's own kernel runs in a tab; in this design it would be the first key, and its elaborator an untrusted prover |
| (f) Incremental by address | — | Verdict cache | 0 to 1 ms per cached verdict | A1 | **Adopted.** An edit re-keys exactly the theorems whose declaration or closure it touched |
| (g) Two kernels, one input | The arena's official checker per Lean version | — | — | A5 or (A3 and A4) | **Adopted.** It is what turns "kernel-checked" into "proved" |

**LexLean, read directly** (PrismPM `35e9f01d`, `vendor/lexlean`; notes in the shared notes folder):

- The proof forms render to tactic scripts: `rfl`, `decide`, `simp only`, `cases`, `induction`, `omega`.
- The "preservation library" is 32 MB of kernel terms in LexLean's core notation. They are the environment for the
  production certificates that the semantics is preserved down to Rust. They are not proofs of a spec's theorems.
- The decoder that turns those terms into Lean runs inside `lean`, so it skips the elaborator but not Lean itself.
- The attestation binds no statement. Issue #354 asks for exactly that.
- There are no proof blocks or certificate forms yet (#343 to #360, open).

**Kernel survey** (read from the arena and the repositories unless marked):

- **The arena's "official" checker** is a 30-line Lean program that replays a lean4export file through `addDeclCore`,
  which is the C++ kernel. It was rebuilt here for 4.32.1.
- **kefir-wasm** passes the arena's scored tests. It reserves 2 GiB of initial memory, which is unsuited to phones.
- **pestka-wasm** passes the arena's scored tests. It is about 0.4 MB, needs WebAssembly GC, and was tested only in
  Node.
- **nanoda** wrongly accepts nothing in the arena and wrongly rejects 2 valid inputs.
- **lean4lean** is "not really an independent implementation", in its own README's words. It has partial proofs and
  needs the Lean runtime.
- None of these checkers has a full correctness proof.

nanoda was chosen because it compiles unmodified, runs in 35 to 102 MB of memory, and was already measured here.
pestka-wasm, the smallest, was not tried.

**Lean in WebAssembly, read directly:**

- The 4.32.1 release ships no wasm asset; the last release with one was v4.15.0.
- v4.32.1's `src/CMakeLists.txt` hard-codes `-pthread` for Emscripten, and the CI job is commented out.
- RFC lean4#16134 (open, 2026-10-31) proposes restoring the job.
- The community 4.33.0-pre build at `lean.cau.li` sends COOP and COEP headers and needs `SharedArrayBuffer`.

## 3. The spec, and what Lean proved about the design

`spec/src/`: four modules, `Verdict`, `ProofObject`, `Reuse` and `Trust` (language 1.2, profile `spec`).

- Checked: `lexlean check --all` exit 0.
- Proved: `lexlean verify` in `prismpm-sdk-candidate@sha256:cd3b47d7…` (LexLean 0.3.0, Lean 4.32.1).
  - Status `verified`.
  - Attestation `177d90d5fec3cafec254a0681db9f9bc8ede66129557ba5f326fc5d4d7d35c8b`.
  - 23 theorems, each with its exact observed axioms.
  - 46 s.
  - Evidence: `spec/evidence/` holds `attestation.json`, `verify.json`, `check.json`, `lexlean.lock` and `run.log`.

| Module (SHA-256) | Theorems Lean proved |
| --- | --- |
| `Verdict` (`10d6d5cf…`) | `acceptedOnlyForTheSpecStatement`, `provedOnlyForTheSpecStatement`: no acceptance unless the checked statement's address is the spec statement's address. `noAcceptanceUnderAnotherKey`, `noAcceptanceOfAlteredBytes`, `noAcceptanceOverAnotherLibrary`, `noAcceptanceWithoutTheKernel` (kernel, types and binding all required), `noAcceptanceWithOtherAxioms`, `provedNeedsLeanOnTheseBytes`, `noProofIsPending`, `onlyProvedReadsProved`, `kernelCheckedNeverReadsProved` |
| `ProofObject` (`15996d20…`) | `anotherToolchainRefused`, `anotherStatementRefused`, `changedDefinitionsRefused`, `anotherTheoremRefused`, `alteredBytesRefused`, `exactRecordAdmitted` |
| `Reuse` (`6f26fdee…`) | `storedResultFailingItsCheckIsNeverBelieved`, `storedUnderAnotherKeyIsNeverBelieved`, `nothingStoredMeansComputing`, `reuseNeverChangesTheVerdict` (under A1, given as a premise) |
| `Trust` (`40573c80…`) | `provedHoldsIfEitherKernelKeyHolds`: under A1, A2 and A6, "proved" implies Lean's kernel proves the spec's statement if A5 holds **or** A3 and A4 hold. `kernelCheckedRestsOnTheIndependentKernel`: under A1 to A4 and A6, any acceptance implies it |

What these proofs cover:

- They are about decisions over addresses, which are read as numbers.
- The meaning of each assumption is an explicit implication in `Trust.coherent`, not prose.
- That the JavaScript computes what the spec says is **tested** (section 5), not proved.
- Lean's proofs of the spec's own theorems were not themselves bound in the tab. That would need a capture of its
  elaboration, as was done for guests and payment.

Found on the way, about LexLean's `linear_arithmetic`. Its `omega` ending cannot use Boolean facts. It failed on:

- `Bool` fields and parameters used as conditions;
- an `if` whose condition contains an `if`;
- `Option` matches.

Each fix was to restate the condition over numbers. Details are in `UPSTREAM.md`, request 5.

## 4. What was built

| File | Role |
| --- | --- |
| `emit.mjs` | Spec data form to kernel terms: statements, equations, constructor types. Closed vocabulary; anything else refused by name |
| `export.mjs` | lean4export NDJSON reader. Writer for new lines, reusing every existing term, since nanoda refuses a repeated one. Constant and axiom closure. Canonical form for type comparison |
| `bind.mjs` | The decision: assemble the bindings, then decide each verdict from one kernel run. Narrows a refusal to the refused obligation on demand |
| `records.mjs` | Keys, records, admission |
| `tab.mjs`, `worker.mjs`, `bench.html`, `serve.mjs` | Session, worker (served with `connect-src 'none'`), bench, static server without isolation headers |
| `official/` | Lean 4.32.1's own kernel as an export checker: the arena's official checker, rebuilt with `Environment.replay` |
| `agree.mjs`, `faults.mjs`, `lean-kernel.sh` | Agreement with the authority, planted faults, Lean's kernel on every input |
| `make-dist.mjs`, `coverage.mjs`, `run-node.mjs`, `run-session.mjs`, `hosted.mjs`, `fix-axioms.mjs`, `verify-loop.sh`, `verify-spec.sh`, `fetch-data.mjs` | Development tools |
| `test.mjs`, `defects.mjs` | The gate, and the defects planted in it |
| `corpus/` | The spec sources and their data forms: guests, payment, and the image's four spec faults |
| `spec/` | The design's spec and its evidence |
| `evidence/` | Agreement, Lean's kernel results, browser results, sizes, coverage, defects, the authority's verdicts |

The checker is the predecessor's nanoda build (`sha256:5a963d9b…`). The library and project exports are its capture
of the SDK image's own elaboration (`sha256:48cc5e54…` for the library). `dist/` is not committed.

## 5. Agreement with the authority

Authority: `lexlean verify` in the pinned image (the predecessor's runs, `evidence/authority/`). "Lean" is Lean 4.32.1's
own kernel on the exact bytes the tab's kernel checked (`evidence/lean-kernel.json`, 7.5 to 11.5 s each, natively).

| Case | Image | Tab | nanoda / Lean on the tab's bytes | Where it is refused |
| --- | --- | --- | --- | --- |
| guests: 5 theorems | verified; 2 with no axioms, 3 with `[Quot.sound, propext]` | proved; same axioms | accept / accept | — |
| payment: 2 theorems | verified, `[propext]` | proved, `[propext]` | accept / accept | — |
| spec: false statement (`+ 2`) | refused, LLV7002 | pending | refuse / refuse | Key layer: no record for the new key. Binding alone: `Serverless.bind…clearAdvances` |
| spec: false statement by reflexivity | refused, LLV7002 | refused | refuse / refuse | The tab makes the proof; the kernel refuses it |
| spec: axioms declared `[]` | refused, LLV7005 | pending | accept / accept | Key layer. Binding alone: the axiom audit, `[propext]` ≠ `[]` |
| spec: broken proof hint | refused, LLV7002 | pending | accept / accept | Key layer only (see below) |
| bundle: statement swapped under the same name | (verified spec) | refused | refuse / refuse | `Serverless.bind…clearAdvances` |
| bundle: broken proof | — | refused | refuse / refuse | The bundle's own declarations |
| bundle: proof by `sorryAx` | — | refused | refuse / refuse | The bundle's own declarations |
| bundle: definition altered, axioms kept | — | refused | refuse / refuse | `Serverless.eqn…breaksEmpty.0`: the same obligation in both kernels |
| bundle: library name declared again | — | refused | — | `SP_REDECLARED` |
| bundle: library bytes altered | — | refused | — | `SP_PREFIX` |
| record: right record, other bytes | — | refused | — | `SP_BUNDLE_ADDRESS` |
| record: another theorem's key | — | refused | — | `SP_KEY` |
| record: another toolchain | — | refused | — | `SP_KEY` |
| record: another project's bundle | — | refused | refuse / refuse | No theorem of that name; the equations fail |

**Pending is not acceptance.** The spec's proof hint is part of the theorem's key. A spec whose hint changed has no
proof until a prover runs that hint, and the image's run of it fails.

The bypass test tries the binding layer alone, with no key layer. It refuses three of the four spec faults. It accepts
the broken-hint spec, because that spec's statement is true and proved. The tab judges statements; the hint is
advice to the prover.

`linear_arithmetic` is therefore the only route by which the two could differ in acceptance. The key layer keeps them
equal. This is a deliberate choice, recorded here, and not a fault.

## 6. Measurements

**Browser.** Claude desktop's in-app browser, Chrome 156 on Windows 11. Each run used a new dedicated module worker;
12 runs per figure. There was no COOP or COEP: `crossOriginIsolated` was false and `SharedArrayBuffer` undefined. The
worker's own `fetch` was refused. The pane was hidden and other sessions were building, so the figures are
pessimistic. Raw figures: `evidence/browser-*.json`.

| ms, median / worst | Desktop | Phone viewport, **emulated** on the same CPU |
| --- | --- | --- |
| Ready: verify and compile the checker (19 to 26), parse the library | 280 / 330 | 376 / 429 |
| Admit a bundle by address | 9 / 16 | 15 / 20 |
| Whole project, first check (indexes the bundle's terms) | guests 1,196 / 1,655; payment 1,151 / 1,365 | 1,783 / 1,954; 1,569 / 1,822 |
| **Whole project, warm** | guests 535 / 727; payment 464 / 610 | 876 / 1,153; 726 / 835 |
| …of which the kernel | 420 / 570 | 514 / 645 |
| **Edited theorem to verdict** (reflexivity; proof made in the tab) | true: 470 / 593; false: 530 / 811 | 795 / 902; 775 / 847 |
| Edit that leaves a theorem's closure unchanged (key recomputed, stored verdict) | 0 / 1 | 1 / 1 |
| Checker linear memory | 102 MB | 102 MB |

Node 22 on the same machine gives the same shape: ready 0.49 s, whole project warm 0.65 to 0.76 s, edit 0.6 s
(`run-session.mjs`).

Against the baseline, for the judgement:

- Today, the SDK image takes 80 to 165 s per project, and Lean's own kernel alone takes 7.5 to 11.5 s.
- The tab takes 0.5 s.
- For an edited `linear_arithmetic` theorem the tab says "pending" in milliseconds. The proof then costs what
  elaboration costs, wherever it runs: the author's own module elaborates in 1.0 to 1.5 s once the library is
  pre-built (predecessor), or 80 to 165 s through today's `verify`.

**Download.** Budget: 300 KB gzip of code, once; 100 KB gzip per project; a one-time library under 5 MB gzip, cached
by address.

| Item | Raw | gzip | brotli | Budget |
| --- | --- | --- | --- | --- |
| Checker (nanoda) | 835 KB | 252 KB | 189 KB | together 272 KB gzip: **met** |
| Tab scripts | 58 KB | 20 KB | 17 KB | (in the line above) |
| Proof bundle, guests / payment | 527 / 510 KB | 77 / 73 KB | 50 / 47 KB | **met** |
| Pinned library, once per toolchain | 25.7 MB | 4.06 MB | 2.72 MB | met against 5 MB; **not lean**. It is the whole runtime-library closure |
| Manifest and records | 2.2 KB | 0.8 KB | | |

Browser features needed: core WebAssembly, a worker, `crypto.subtle` (so HTTPS), the Cache API or OPFS. Not needed:
threads, `SharedArrayBuffer`, cross-origin isolation, 64-bit memory.

## 7. Security

What a malicious party can do:

- A **prover or store** can withhold a proof. The theorem then stays pending.
- It cannot change what a theorem states, what a definition computes or what a type holds: each is the tab's own
  term, checked by the kernel.
- It cannot have a wrong proof accepted unless the checking kernel is unsound.
- It cannot add an axiom: the bundle may declare none, and the audit requires the declared set exactly.
- It cannot change the library: every byte is compared.
- It cannot redirect a record: the key is computed in the tab.
- The **attester** of Lean's run can only promote "kernel-checked" to "proved". That promotion is wrong only if the
  attester lied and nanoda is also unsound on those bytes (`provedHoldsIfEitherKernelKeyHolds`).
- **Nobody signs** the manifest or attestations. An address proves which bytes, not who made them.

The worker reaches no network. Its WASI host answers 11 calls from memory and refuses any other import.

## 8. The experience

There is one word per verdict: **Proved**, **Kernel-checked**, **Proving…**, **Refused**. "Checked" stays the word for
`lexlean check`. The reason appears on a tap: the first obligation the kernel refused (for example "definition
breaksEmpty is not the spec's"), the key that has no proof, or the axioms that differ. There is nothing to configure.
Any failure, absence or mismatch reads as Proving… or Refused, never as Proved.

- **First visit:** the tab fetches the checker (252 KB) and the pinned library (4 MB gzip, once per toolchain) and
  keeps them by address. Theorems with published proofs read Proved or Kernel-checked within about a second.
- **While typing:** each edit re-keys only the theorems it touched.
  - Unaffected theorems keep their verdict in under a millisecond.
  - A reflexivity theorem gets its verdict in half a second.
  - Any other edited theorem reads Proving… until a prover publishes a bundle. That prover is the hosted service
    today, and any Lean, including Lean in WebAssembly, later.
- **Offline:** everything already proved stays proved: the bytes are local and the check is local. New
  `linear_arithmetic` theorems wait as Proving….
- **On a phone:** the same, at about 1.6 times the desktop time in emulation. Real phones were not tested.
- **When the tab cannot decide:** the word stays Proving…, and the reason names what is missing: a proof for this key,
  or a construct the emitter cannot state.

## 9. What it would take to ship

1. LexLean emits the kernel terms of statements, equations and types, in place of `emit.mjs`, and publishes bundles
   over a pinned library export (requests 1 to 3).
2. PrismPM pins Lean 4.33.1 or later, for #14576 (request 6).
3. A single-threaded WebAssembly build of Lean's kernel that reads export files (request 7). With it, "proved" needs
   no attester: about 20 MB brotli if it comes from the probed build, perhaps far less if it is kernel-only.
   Measuring that is the next decisive experiment.
4. Shrink the pinned library: per-declaration addresses (a Merkle form), so a tab fetches only what a project
   reaches. A single theorem's closure was 83 to 657 KB gzip in the predecessor's measurements.
5. Foundry: wire the worker into the app, store bytes in OPFS by address (as `v2/reuse` does), and show the four
   words.

## 10. Measured, estimated, not established

**Measured:**

- sections 5 and 6;
- the agreement of the two kernels on 14 inputs;
- the coverage of the emitter, `evidence/coverage.json`. It states all 35 theorems of the corpora that have a data
  form: guests 5, payment 2, reuse 26, probe-view 2, with 82 definition equations and none refused. Only the guests
  and payment statements were bound against elaborated proofs;
- the proof forms in the sources: 41 `linear_arithmetic` and 6 `reflexivity`;
- the spec's proof;
- `node --test v2/serverless-prove/test.mjs`: 9 of 9 pass, none skipped. It fails, never skips, without `dist/`;
- `node defects.mjs`: four defects were planted in the gate's own code. Each made it fail (1, 1, 1 and 2 tests), and
  each file was restored byte for byte, after which 9 of 9 pass. The first planting found that the gate was weak: a
  fault meant to show that equations are needed was being refused for incidental reasons (a missing axiom).
  `evidence/defects.json` records the sharpened fault and the run.

**Estimated:**

- the size of a kernel-only Lean wasm;
- phone speed, at about 1.6 times desktop in emulation;
- the elaboration cost per edit once the library is pre-built (from the predecessor).

**Not established:**

- that nanoda and Lean's kernel are the same judgement. Agreement holds on 14 inputs, which is not a proof;
- the emitter's faithfulness beyond the 7 statements bound against elaborated proofs;
- A6 per definition: it is a mathematical fact, not checked per instance;
- equations by `Eq.refl` for well-founded (non-structural) recursion, which no spec here uses and which would likely
  need prover-supplied proofs;
- Firefox, Safari, any real phone, any real network;
- the Cache API or OPFS path in this bench: bytes were passed from the page;
- who signs manifests and attestations;
- Lean's own kernel in a tab.
- **con-ron in a tab.** con-ron is the Rust checker proved to refine con-leche, whose accepted environments are
  proved to have a set-theoretic model. In the arena's own runs it is the fastest verified checker (see
  `KERNELS.md`). Whether it builds as single-threaded wasm32, its size, its speed in this bench and its verdicts on
  the planted faults were not measured. The build was approved by the user and handed to the kernel-probe session
  (branch `claude/kernel-prism-probe-d15d63`), which had not run it when this report was closed. If it measures as
  lean and fast as nanoda, it would replace nanoda as the second key. A3 would then rest on a published proof of
  refinement and consistency, not on agreement alone.

## Reproduce

1. **Build the predecessor's exports.** Run `v2/in-tab-prove/build.sh`, `capture-staging.sh` and `make-exports.sh` in
   WSL (about 15 minutes). Copy `kernel-tab.wasm`, `library.ndjson`, `guests.whole.ndjson` and `payment.whole.ndjson`
   into `v2/serverless-prove/dist/`.
2. **Make the served artefacts.** Run `node make-dist.mjs`, then `node --test test.mjs`.
3. **Run the agreement.** Run `node agree.mjs`, then `bash official/build.sh` and `bash lean-kernel.sh` in WSL, then
   `node agree.mjs` again to merge Lean's verdicts.
4. **Prove the spec.** Run `bash verify-spec.sh` in WSL. It needs Docker and the pinned image.
5. **Run the bench.** Run `node serve.mjs`, then open `/v2/serverless-prove/bench.html?runs=12`.
