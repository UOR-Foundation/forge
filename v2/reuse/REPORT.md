# Report: address-based reuse

Five LexLean modules (profile `spec`, language 1.2), four adapters, one test suite. Nothing is committed.

## Proved (Lean kernel, hosted verify task-135, draft `spec/eec8d44ae915fb56a3f41f33b55f691009aecdcd626f2eeb8803072a0acade05`, state `verified`)

26 theorems, each with its exact axiom set. An attestation is found by the SHA-256 of each source:

| Module | SHA-256 | Theorems |
| --- | --- | --- |
| [Encoding](src/Encoding.lex.tex) | `054aaa9a38fcc1eefb1a7b507f42334d354b44df7daf4252e9e3396ca3c3b21a` | `pairOrderFree`, `tripleSwapFirst`, `tripleSwapLast` (canonical order is independent of insertion order for every set of 2 and 3 addresses), `unorderedOrDuplicateRefused` (out-of-order or duplicate adjacent members are refused, for any tail) |
| [Address](src/Address.lex.tex) | `a580c33fea293fa428666fa95fcc57acad637f022a7e55a1c7f57ad9a933e00f` | `unchangedKeepsAddress`, `nothingReusedAcrossToolchains` (a toolchain change always reads as toolchainChanged), `changedBytesAreStale`, `changedDependencyIsStale`, `freshExactlyWhenUnchanged` (fresh if and only if toolchain, own bytes and dependencies are all unchanged), `addedIsChecked` |
| [ProofCache](src/ProofCache.lex.tex) | `0d37150a6420443a7351ff3a8e0be318177977757e913fc8e0b331176947a219` | `noAdmissionOnAddressMismatch`, `noAdmissionOnToolchainMismatch`, `noAdmissionOnClaimMismatch`, `missingAttestationNeverAdmitted`, `unverifiedAttestationNeverAdmitted`, `differentAttestationNeverAdmitted`, `exactRecordAdmitted`, `consultBeforeWork` (the first step is always consult), `reuseOnlyWhenAdmitted` |
| [Store](src/Store.lex.tex) | `3999ddd40645388a39d64139e8046a4c2d19932db11251b2a6015a306e924e2d` | `readRefusesMismatch`, `readAcceptsMatch`, `restoreRefusesMismatch`, `restoreRefusesBadMember` |
| [Ahead](src/Ahead.lex.tex) | `5de261fb955ccb8c2316bd39a8ca1518937f13217bc08d9611683f814abee290` | `stateChangeInvalidatesEveryEntry`, `appChangeInvalidatesEveryEntry` (for every table), `counterHitEqualsCompute` (for the counter instance) |

The proofs are about decisions over addresses read as numbers. They assume BLAKE3 is collision resistant; that is not and cannot be proved here.

## Checked only

Every definition in the five modules passes `lexlean check`; the preimage builders (`toolchainPreimage`, `ownPreimage`, `dependenciesPreimage`, `keyPreimage`, `blobPreimage`, `snapshotPreimage`), the canonical sort, `recheck`, the typed wrappers (`staleness`, `admitRecord`, `nextStep`, `read`, `restore`, `snapshotForm`, `answer`) carry no theorem. Their behaviour is tested, not proved.

## Tested (`node --test v2/reuse/test.mjs`: 25 of 25 pass)

Run through the interpreter on the data form of the verified draft. Covers, per mechanism, positive cases and typed refusals: exact preimage bytes; addresses stable without edits and independent of dependency order; an edit re-checks exactly the declaration and its transitive dependents; toolchain change re-checks all; framing separates name from body; cycles, unknown and duplicate names refused; cache miss, publish, hit without work; every refusal reason; a forged server record refused; store put/get, altered bytes, missing and malformed addresses refused; snapshot order independence over all 120 permutations of 5 members and 20 random sets of 1 to 9; tampered snapshot, missing member, duplicate member refused; compute-ahead hit equals `dispatch` for 36 states and both actions; a state change, another app, and an action not on screen all compute; a corrupted precomputed response is refused.

Planted defects ([VERIFICATION.md](VERIFICATION.md), `node v2/reuse/defects.mjs`): one per mechanism, each made the suite fail (2, 1, 2 and 1 tests) and each file was restored byte for byte, after which 25 of 25 pass.

OPFS: exercised once in the in-app browser (Chromium 152): 8 of 8 checks, including persistence across store instances, refusal of altered bytes on disk and of a tampered snapshot, and no partial files left. Not run in Safari or Firefox, not in a worker, not under `node --test`.

## Measured (Node 22.21, one Windows desktop, medians, [bench.log](bench.log))

| What | Runs | Median | 95th |
| --- | --- | --- | --- |
| Address 200 declarations (model preimages + BLAKE3) | 30 | 246 ms | 300 ms |
| Staleness decision for 200 declarations | 30 | 2.2 ms | 8.0 ms |
| Proof cache hit (consult, verify 2 KB attestation, admit) | 500 | 0.16 ms | 0.27 ms |
| Proof cache miss (consult, refuse, no-op work, publish) | 500 | 0.11 ms | 0.23 ms |
| Store get, 1 KB, verified, memory | 300 | 0.08 ms | 0.14 ms |
| Store get, 64 KB, verified, memory | 300 | 2.6 ms | 3.6 ms |
| BLAKE3 alone, 64 KB | 300 | 2.4 ms | 3.2 ms |
| OPFS get, 1 KB / 64 KB, verified (browser) | 200 | 1.3 ms / 5.7 ms | |
| OPFS put, 1 KB / 64 KB (browser) | 50 | 2.4 ms / 6.8 ms | |
| Counter: compute / compute-ahead hit | 1000 | 0.10 ms / 0.13 ms | |
| Library view (CBOR codec): compute / compute-ahead hit | 300 | 1.65 ms / 0.10 ms | 5.4 ms / 0.17 ms |

Read plainly: staleness is cheap; addressing is the cost (about 1.2 ms a declaration in the interpreter, mostly writing 32-byte numbers digit by digit). A verified read is dominated by the JavaScript BLAKE3. Compute-ahead loses for the counter (its `dispatch` is already 0.1 ms) and wins 16 times for the library view, whose `dispatch` runs the CBOR codec. The cache-hit and cache-miss timings are the decision path only: the work they skip or run is a hosted verification of 20 minutes or more, which is not something this cache can skip today.

## Not established

- Any reduction in proof or check time. Mechanisms 1 and 2 need per-declaration verification from the toolchain; see [UPSTREAM.md](UPSTREAM.md).
- Canonical order for sets of more than 3 members, and lookup in tables of any size, by proof: there is no induction tactic. Tested only.
- "A hit equals computing" for any app other than the counter instance: generically it rests on `step` being a pure function, which the interpreter and the guest are trusted to honour.
- Injectivity of the preimages (that different declarations get different bytes) is tested, not proved.
- Agreement between the interpreter and a compiled guest for these modules: no holo was built.
- The `Classical.choice` pattern in [VERIFICATION.md](VERIFICATION.md) is inferred from refusals, not read from Lean.
- OPFS in a worker, in Safari or Firefox, under quota pressure, or with concurrent writers.

## Files

[DESIGN.md](DESIGN.md), [src/](src), [data/](data) (data form of the verified draft), [adapter/](adapter) (`model`, `address`, `proof-cache`, `store`, `ahead`; BLAKE3 from `studio/shell/prism-code/src/blake3.mjs`), [test.mjs](test.mjs), [defects.mjs](defects.mjs), [bench.mjs](bench.mjs), [opfs.html](opfs.html) with [serve.mjs](serve.mjs), [VERIFICATION.md](VERIFICATION.md), [UPSTREAM.md](UPSTREAM.md).

Interpreter: `v2/shell/interp.mjs` was imported unchanged and lacked nothing these modules use.
