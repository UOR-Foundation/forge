# Verification evidence

## Gates

| Gate | Command | What it proves or tests |
| --- | --- | --- |
| Check | `lexlean_check` on the draft, profile `spec`, language 1.2 | The five modules parse, link and type-check |
| Verify | `lexlean_verify` on the same draft | Lean's kernel accepts every theorem with its declared axiom set |
| Tests | `node --test v2/reuse/test.mjs` | Positive cases and refusals for all four mechanisms, run through the model's data form |
| Planted defects | `node v2/reuse/defects.mjs` (output in [defects.log](defects.log)) | The test gate fails on one defect per mechanism and passes again after a byte-for-byte restore |
| Browser store | [opfs.html](opfs.html), served by `node v2/reuse/serve.mjs` | The OPFS backend, in the in-app browser |

## Planted defects

Each defect is planted in the bytes the adapters actually run: the model's data form (`data/*.json`, which the interpreter executes) or an adapter file. The harness restores the file and compares its SHA-256 with the original.

| Mechanism | Defect | Failing command | Diagnostic | Restored |
| --- | --- | --- | --- | --- |
| 1 Address | `stalenessCode` compares `previous.dependencies` with itself, so a changed dependency is not seen | `node --test v2/reuse/test.mjs`: exit 1, 23 pass, 2 fail | not ok: "an edit re-checks the declaration and everything that depends on it, and nothing else"; "a change deep in the graph reaches every transitive dependent" | exit 0, 25 pass, byte for byte |
| 2 Proof cache | `admissionCode` compares the query's toolchain with itself, so a record from another toolchain is admitted | exit 1, 24 pass, 1 fail | not ok: "refusals: every mismatch and a missing or altered attestation is refused with its reason" | exit 0, 25 pass, byte for byte |
| 3 Store | `get` takes the derived address to be the expected one: Hologram's unverified local read | exit 1, 23 pass, 2 fail | not ok: "refusals: altered bytes, a missing address and a malformed address"; "a corrupted precomputed response is refused, not served" | exit 0, 25 pass, byte for byte |
| 4 Compute ahead | `lookupCode` checks the app but not the state, so a table answers for another state | exit 1, 24 pass, 1 fail | not ok: "a state change invalidates every entry; an event not on screen is computed" | exit 0, 25 pass, byte for byte |

Defects 1, 2 and 4 are also excluded by proof: `changedDependencyIsStale`, `noAdmissionOnToolchainMismatch` and `stateChangeInvalidatesEveryEntry` are false of the planted model. The proof holds of the LexLean source; the tests hold the interpreted data form to it.

## Lean verification rounds

Each round is one hosted `lexlean_verify`; each refusal named one problem.

| Task | Draft | Result | Correction |
| --- | --- | --- | --- |
| task-128 | Encoding only | `LLV7005`: `hexDigit` observed no axioms, declared `[Quot.sound, propext]` | Removed axiom lists from all definitions |
| task-129 | All five, first form | `LLV7002`: `omega` could not prove `exactRecordAdmitted` | Restated over two values with the equalities as premises |
| task-130 | All five | `LLV7002`: `omega` could not prove `unchangedKeepsAddress` | Same cause and fix; also `readAcceptsMatch` |
| task-131 | All five, binary encoding | Lean accepted the proofs; `LLV7005`: `unchangedKeepsAddress` observed `[Quot.sound, propext]` | Declared `[Quot.sound, propext]` on every theorem closed by split and `omega` |
| task-132 | All five | Address and Ahead past the audit up to `nothingReusedAcrossToolchains`: observed `[Classical.choice, Quot.sound, propext]` | Added `Classical.choice` to the seven theorems whose proof eliminates a double negation |
| task-133 | All five | Address and Ahead accepted; `LLV7005`: `pairOrderFree` observed `[Classical.choice, Quot.sound, propext]` | Same for the three ordering theorems; also, wrongly, for `consultBeforeWork` |
| task-134 | All five | Encoding accepted; `LLV7005`: `consultBeforeWork` observed `[Quot.sound, propext]` | Reverted that one |
| task-135 | All five, final (`spec/eec8d44a…`) | **verified** | |

Pattern found for the axiom sets: a theorem whose closing `omega` must eliminate a double negation (the negative branch of an `if not P` against a premise `not P`), or whose goal is a positive statement about conditional terms, uses `Classical.choice`; the rest use `[Quot.sound, propext]`; `addedIsChecked`, closed by simp alone, uses `[propext]`. This was inferred from the refusals, one per round, not read from Lean.

Cause of the two `omega` failures: `linear_arithmetic` runs `simp only`, then `split`, then `omega`. A comparison of a value with itself is simplified to `True`, leaving `¬True` as the branch condition, which `omega` cannot use. No statement was weakened: each was restated over two values with their equality as a premise, which says the same thing.

## Browser (OPFS)

Run in the Claude desktop app's built-in browser (Chromium 152, Windows 11), page [opfs.html](opfs.html). All eight checks passed: put then get; a second store over the same OPFS reads the bytes back; altered bytes on disk refused (`store.mismatch`); missing address refused (`store.missing`); snapshot address independent of order; restore returns every member; tampered snapshot refused (`store.mismatch`); no `.partial` file left behind (`move` is supported there, so the atomic path ran). The page is not part of `node --test`; it was run by hand once.
