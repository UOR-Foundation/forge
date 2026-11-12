# Checking a library spec from a browser tab

Result: a spec that imports PrismPM's library can now be checked from a tab with no local toolchain. On 17 corpus files the hosted route and `lexlean check --all` in the pinned SDK image give the same verdict, and the same codes, messages, lines and columns. The verdict is "checked", never "proved".

## 1. Diagnosis

The refusal is real and comes from the library module's title, not the spec's. Reproduced with `guests-2` plus `Model.lex.tex`, sources as shipped:

```
LLL1004 `Browser` is not a phrase concept   src/Foundation/View/Browser/V1/Model.lex.tex:5:8-5:15
```

Line 5 is `\title{Browser view model}`; columns 8 to 15 are the word `Browser`. With the library's title fixed and the spec's left alone, the same code moves to `src/App.lex.tex:6:8`, the spec's own `\title{Browser view model}`. Nothing else in either file is refused.

Why the earlier attempt (`v2/loop/hosted-check.mjs`) did not fix it: its pattern `/\title\{[^}]*\}/` is a regular expression literal, where `\t` means a tab. It looked for a tab followed by `itle{`, matched nothing, and every file went out unchanged. The replacement string had the same fault inside a template literal. With `\\title` the replacement applies and the hosted service checks the project.

The rule. `lexlean_explain LLL1004` says only "Unknown non-whitespace primitive atom" (class `language`). From the behavior: the text of a `\title` must be read entirely as a sequence of phrases from the lexicon packages the project uses; any word that does not begin a known phrase is refused with `LLL1004` at that word. The match is case-sensitive (`browser view model` is refused in the image too), and two phrases in a row are accepted (`Browser view model Bounded byte buffer` passes in the image). Every `prism.arch` title phrase is a `label-word` with frame `atom`, arity 0 and features `sentence-case, singular`. The hosted `prism-app` profile carries `prism.arch@1.0.0` with 2 of those entries ("Text application model", "Bounded byte buffer"); the SDK image carries 141. The `spec` profile carries no `prism.arch` at all and refuses the project earlier, with `LLR3001 prism.arch@1.0.0 is not in the locked closure`.

## 2. The workaround and exactly what it changes

Candidates tried:

- Title replacement for checking only: works. Chosen.
- Another hosted profile: none fits. `spec` lacks `prism.arch`; `prism-app` is the only other.
- Sending the lexicon in the draft: refused. A draft may only hold files under the source root `src`; `language/prism.arch/...` and `lexlean.toml` are refused with `OutsideRoots`.
- Inlining the library into one module: not tried, because it changes declarations (their qualified names) and so is not acceptable.

What is sent, against the real sources:

- In each module's one-line `\title{...}`, every phrase of the SDK's `prism.arch` that the hosted lexicon lacks (139 of 141) is replaced, as whole words, by `Text application model`. Phrases the hosted lexicon holds, and every other word, are sent as written. A title that spans lines is sent unchanged.
- Nothing else changes: every byte outside the title's braces is identical, and every line keeps its number (`test.mjs` asserts both for every corpus file).
- Each imported library module is sent, transitively, from copies that are byte for byte the image's `stdlib/src` (all 7 compared inside the image). This also replaces the hosted profile's own copies of `Foundation.Bytes` and `Foundation.View.Text.V1.Model`; a planted empty `Foundation.Bytes` proved the draft's file is the one checked.
- The hosted profile adds a module the author did not write, `Contract`, which `all: true` also checks.

Why the title replacement cannot change a verdict, and where that argument stops:

- A title declares nothing. The data form of a module does not contain its title: the retitled `guests-2` data form holds neither title string, and the retitled library module's data form is byte-identical to the one fetched with the real title.
- The substitute has the same category, frame, arity and features as every phrase it replaces (`make-library.mjs` refuses to build `library.json` otherwise). So the title rule sees the same sequence of phrase kinds, with words it cannot resolve left exactly where they were. A title that is wrong in the image (an unknown word, the wrong case) stays wrong on the hosted route, at the same column after mapping.
- The image accepts a title whose phrase denotes a different module (`App` titled "Browser view model" passes), so the substitute's denotation, `Foundation.View.Text.V1.Model`, is not checked against the module either.
- The limit: this is an argument from observed behavior plus 17 files, not from the checker's source. If the title rule depends on something else about an entry (its ID, its denotation), the argument fails. No case showed that.

Positions are mapped back: lines never move; on a title line, a position after a replaced phrase shifts by the length difference, and one inside it points into the phrase as written. Byte offsets are mapped the same way. Diagnostics carry `origin`: `author`, `library`, or `hosted` (a file the draft did not send).

## 3. Agreement with the authority

Corpus (`corpus/`, built by `make-corpus.mjs`): `guests-1`, `guests-2`, `guests-3` (another model's answer, which the image refuses), `payment` (with the `PaymentApproval` module it imports, sent as the author's second module), and 13 single-fault variants of `guests-2`. Each fault is one textual change that must apply the expected number of times.

Image: `lexlean check --all` in `prismpm-sdk-candidate@sha256:cd3b47d7…`, each case as its own project holding the 7 library copies (`image.mjs` → `image-results.json`). Hosted: `check.mjs` (`agree.mjs` → `agreement.json`).

| File | Image | Hosted | Image codes | Hosted codes | Messages and positions |
| --- | --- | --- | --- | --- | --- |
| guests-1 | checked | checked | none | none | identical |
| guests-2 | checked | checked | none | none | identical |
| guests-3 | refused | refused | LLT4001 | LLT4001 | identical |
| payment | checked | checked | none | none | identical |
| broken/unknown-name | refused | refused | LLT4001 | LLT4001 | identical |
| broken/wrong-type | refused | refused | LLT4001 | LLT4001 | identical |
| broken/missing-field | refused | refused | LLT4001 | LLT4001 | identical |
| broken/constructor-arity | refused | refused | LLT4001 | LLT4001 | identical |
| broken/reserved-name (`decide`) | refused | refused | LLT4001 | LLT4001 | identical |
| broken/non-terminating | refused | refused | LLT4001 | LLT4001 | identical |
| broken/bad-qualifier | refused | refused | LLT4001 | LLT4001 | identical |
| broken/malformed-syntax | refused | refused | LLP2001 | LLP2001 | identical |
| broken/title-not-in-lexicon | refused | refused | LLL1004 | LLL1004 | identical |
| broken/title-lowercase | refused | refused | LLL1004 | LLL1004 | identical |
| broken/title-phrase-then-unknown | refused | refused | LLL1004 | LLL1004 | identical (column 27 after mapping) |
| broken/title-two-phrases | checked | checked | none | none | identical |
| broken/title-hosted-word | checked | checked | none | none | identical |

No difference in any code, message, line or column. One thing to know about the codes: every type, name and recursion fault is `LLT4001` with a span covering the whole semantic module (line 8 to the end), on both routes. So "the diagnostic points at the right line" holds for syntax and title faults; for link-phase faults both routes point at the module, and only the message names the declaration.

Versions. The two routes run different compilers. Image: `lexlean 0.3.0`, `compiler-semantics 8554008…`, Lean 4.32.1; its CLI has no `snapshot` command. Hosted: the gateway's repository pins LexLean v0.4.0 (`UOR-Foundation/lexlean-mcp`, `.github/lexlean.rev`, `e0b74b8`), and a hosted snapshot reports `compiler_semantics_id 81a5f530…`, language 1.2. Whether the deployed service runs exactly that pin was not established. So the agreement above is empirical: two compilers agreeing on 17 files. A file that exercises a change between 0.3 and 0.4 could disagree, and nothing here would catch it in advance; the agreement test is the guard, and it has to be rerun whenever either side moves.

## 4. The in-tab path

- `check.mjs` (8.4 KB, 3.4 KB gzip, no dependency, runs in a browser and in Node): `check(spec, { library, extras })` returns `{ ok, diagnostics, data, draft, ms }`, with diagnostics mapped to the text as written and `data` holding the data form of each of the author's modules when it checked. `loadLibrary(readText)` reads `library.json` (7 module paths, the 141 SDK title phrases, the image digest). Failures are typed: `HC_UNREACHABLE`, `HC_HTTP`, `HC_RATE_LIMITED`, `HC_RPC`, `HC_DRAFT_REFUSED`, `HC_DATA_REFUSED`, `HC_NO_MODULE`.
- `studio.html`: a text area and a Check and run control. On a pass it loads the data form with the library's data forms from `../probe-payment/data/Foundation/` into `../shell/interp.mjs`, admits each frame with the library's `presentationValid`, and draws with `../shell/render.mjs`, as `shell/app.html` does. On a refusal it lists the diagnostics; clicking one selects its span in the text area. A Content Security Policy allows only this origin and `https://mcp.uor.foundation`.
- `interp.mjs` and `render.mjs` were imported as they are. Nothing was missing for this path.

## 5. Tested in the in-app browser

Served with `node v2/shell/serve.mjs` on port 4219 (4187 was taken by another server), page `/hosted-check/studio.html`.

- `guests-2`: Check and run → "Checked", the guest list drawn, frame valid. Typed "Ada", Enter, "Grace", Enter with real keystrokes: the table reads Grace then Ada and the box empties after each add.
- `broken/title-phrase-then-unknown`, put into the text area by an `insertText` edit (the equivalent of a paste): "Refused: 1 diagnostic", `LLL1004 line 6, column 27`, and clicking it selects exactly `Guest` in `\title{Browser view model Guest list}`. `broken/malformed-syntax` gives `LLP2001` at line 23 on every run.

Timings, 12 runs each, through the same function the control calls, one desktop machine, home network:

| Measure | Set 1 median / worst | Set 2 median / worst |
| --- | --- | --- |
| Press to verdict, `guests-2` (checks) | 563 / 1,121 ms | 988 / 1,718 ms |
| Press to verdict, `malformed-syntax` (refused) | 544 / 1,612 ms | 735 / 816 ms |
| Press to first frame written, `guests-2` | not separated | 1,385 / 2,240 ms |
| Hosted stages, set 2: write / check / data form | | 491 / 489 / 332 ms medians |
| Data form to frame (load, step, view, validate, draw) | | 8 / 16 ms |

The first frame is timed when it is written to the page. The paint after it was not measured: the browser pane was hidden for the whole session, which first throttled `requestAnimationFrame` to about 680 ms and then stopped it; the page now waits at most 2 s for a paint and says when none came. The two sets differ by the network alone. Almost all of the time is three round trips to the hosted service.

`node --test v2/hosted-check/test.mjs`: 5 of 5 pass. It covers: only title text changes and no line moves; which phrases are replaced; position mapping after and inside a replaced phrase; that `image-results.json` covers the corpus and was made from the same library; and live agreement on all 17 files. It never skips: an unreachable or rate-limited service fails it.

Planted defects (restored, `cmp` equal, 5 of 5 again):

- The original bug (`\title` written as `\t` + `itle` in the pattern): 3 tests fail, including agreement on `bad-qualifier` and every library case, which go back to `LLL1004` on the library's title.
- Mapping that ignores the shift: 2 fail; agreement shows `6:31-6:36` where the image has `6:27-6:32`.

One run failed with a cause not captured. Three runs right after it failed with `Rate limit exceeded: too many tool calls`; a corpus run is about 50 calls. A later run, after writing UPSTREAM.md, passed. The rate limit is now a typed failure, `HC_RATE_LIMITED`.

## What the workaround cannot do

- It checks; it does not prove. Proof still runs on the real files, in the image or through `lexlean_verify`.
- It depends on a hosted service that keeps drafts unlisted, not private. Every check sends the spec and the library to `mcp.uor.foundation`.
- It depends on the service's availability and rate limit, and on its compiler, which differs from the SDK's.
- It holds only while the hosted `prism-app` lexicon keeps "Text application model" with the same shape, and while the hosted check reads titles the way described above. The agreement test detects a change; nothing prevents one.
- It does not cover lexicon phrases used outside a `\title` (none of these specs do); such a spec would be refused on the hosted route and might pass in the image.
- The studio holds one module. A spec with a second module of its own, like `payment`, is checked by `check.mjs` (`extras`) but cannot be entered in the page.

## Not established

- The checker's title rule from its source. It is inferred from behavior and 17 files.
- The exact LexLean build deployed at `mcp.uor.foundation`, and what differs between it and the image's 0.3.0.
- Agreement beyond this corpus. It is a sample of fault kinds, one example of each.
- Paint time and any figure on a phone, another browser, or another network.
- The gateway's rate limit itself (calls per window).

## Files

`check.mjs`, `studio.html`, `library.json` (from `make-library.mjs`), `corpus/` (from `make-corpus.mjs`), `corpus.mjs`, `image.mjs` → `image-results.json`, `agree.mjs` → `agreement.json`, `test.mjs`, `UPSTREAM.md`. `hosted-check.orig.mjs` is the unchanged copy of `v2/loop/hosted-check.mjs`, kept to show the bug.
