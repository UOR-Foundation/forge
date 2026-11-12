# Prism AI Foundry v2: architecture

Status: draft for approval. Nothing is built. Evidence is marked measured, read (from the repo at 8053eb5) or assumed.

## The law

An LLM writes LexLean spec and nothing else.
Every shipped byte is a pure function of two digests: the spec and the projector.

## What the probe showed

I wrote a minimal app in the Elm shape and ran it through the hosted LexLean toolchain (profile `spec`, language 1.2).
The source is [probe/ProbeTree.lex.tex](probe/ProbeTree.lex.tex).

- Measured: `lexlean check` accepts it, first attempt, no diagnostics. Semantic ID `276eb21982be…`.
- It contains what the design needs: an `Event` type with payloads, an `Effect` type, a recursive `Node` view tree whose buttons carry events, `step : State -> Event -> Outcome`, `view : State -> Node`, and a theorem about `step`.
- Lean verification of the theorem: see "Verification result" at the end.

So LexLean 1.2 can express the model. The language is not the blocker.

## The real gap: projection

Read from `Foundation/View/Text/V1/Model.lex.tex` and `studio/UPSTREAM.md`: the only application shape the projector builds today is `TextApplication`.
That is bytes in, bytes out, with seven fixed labels. There is no projector for an interactive view tree.

Two ways to close it:

- A. Ask upstream for a view-tree application family in PrismPM. Clean, but outside our control.
- B. Carry the view over the existing shape. The guest stays a pure function from request bytes to response bytes. The request is the encoded state and event; the response is the encoded new state, effects and view tree. The shell decodes the response and draws it.

Recommendation: B now, A as an upstream request.
B needs no toolchain change, every app stays an ordinary holo, and acceptance vectors become replayable event traces.
Its cost: the state travels on every dispatch, bounded by `requestMaximum` and `responseMaximum`. Large state needs a content-addressed store with digests in the state. That is designed, not measured.

## Parts

1. Spec. LexLean modules: `State`, `Event`, `Effect`, `Node`, `step`, `view`, wire codecs, properties. Foundry's own spec extends the existing kernel (`app/src`).
2. Interpreter (preview projector). LexLean has a canonical JSON form of a semantic module (`\semanticdata`, read in `studio/src`). A small evaluator over that form runs `step` and `view` in the tab with no compile. The language is total and first order, so the evaluator is small. Assumed, not built.
3. Compiler (publish projector). The existing lane: LexLean, Lean 4.32.1, lean4-prod, Rust, wasm32, holo. Unchanged.
4. Renderer. Draws any `Node` tree to the DOM with keyed patches. One for Foundry and every generated app.
5. Effect interpreter. Performs declared effects (store, infer, preview, publish, identity) and returns results as events. The kernel's gate (FK-05 to FK-09) decides each one.
6. Worker. Service worker as origin kernel: serves the shell offline and previews in an opaque-origin sandbox.
7. Inference port. Bring-your-own-key cloud adapter and local WebGPU adapter. Output is spec text only.

## Trusted base

Trusted without proof, and so to be kept small and listed in every release receipt: the interpreter, the renderer, the effect interpreter, the worker, the wire decoder, the lane's projector.
The interpreter is held to the compiled guest by replaying every acceptance vector through both; a disagreement blocks publish.
This is testing, not proof. A preservation proof per projector is future work and will be claimed only when it exists.

## Proof speeds

- Instant, in tab: the interpreter runs the app; the region procedure checks decision-table rules (sound by `regionCheck_sound`). Properties outside that fragment are not checked instantly.
- Check, hosted: `lexlean check`. Needs the network and sends the spec to `mcp.uor.foundation` (unlisted, not private) until LexLean compiles to wasm32. Latency not measured.
- Attest, hosted or GitHub Actions: Lean kernel and leanchecker. About a minute by the docs.

"Runs entirely in the browser" is therefore true for editing, preview and running apps, and false today for check and attest. The UI must say so.

## Removed

Dyad, the `window.electron` host and its contract policing, Hollama, React and its libraries, Monaco, the Python authoring scripts, Electron-era panels, and the gates that only guard those bytes. About 540,000 lines (measured).

## Decisions I need from you

1. Projection: B (view over the text-application shape) now, with A filed upstream?
2. Where to build: a branch of your local Foundry checkout, or a new repository from `UOR-Foundation/template`?
3. First milestone: the walking skeleton with one generated app (a counter-class app, spec to live preview to published holo), before any Foundry screens?
4. Is sending draft specs to the hosted checker acceptable until an in-tab checker exists?

## Open questions

- String operations and number formatting available in LexLean 1.2 (the probe shows numbers as a `number` node to avoid them).
- Whether proofs about `step` over recursive state stay inside the tactics LexLean offers (`linear_arithmetic` is the one read so far).
- Interpreter speed on a large `view`; whether incremental view diffing belongs in the spec or the renderer.
- Size of the compiled guest for a non-trivial app against a 150 KB budget.

## Verification result

First run (`task-126`, tree-shaped probe): refused with `LLV7005`. Lean closed the theorem, but it uses the axiom `propext` and the source declared none. The tactic was right; the axiom list was wrong. It took several minutes, not one.

Second run (`task-127`, bytes-in, bytes-out probe, axiom lists corrected, two theorems): verified. Lean proved `resetClears` and `strideKeepsCount` for every state. The attestation is found by the SHA-256 of [probe/Probe.lex.tex](probe/Probe.lex.tex), `b54a59f83688c4a2a65c30b3c5cd2b9135832e3fd38f8ca269364d87304d3f41`. The run took over ten minutes. The codec and `dispatch` are checked, not proved: no theorem is stated about them.

## Decided

- 2026-11-12: projection B. The view is carried over today's text-application shape. See [probe/WIRE.md](probe/WIRE.md) for the first wire format, which passes `lexlean check`.
- Consequence found while writing it: about 120 of the probe's 190 lines are hand-written codec. The codec must be derived from the types, by a shared verified module or a projector step, before any LLM writes app specs.
- Consequence: the view is a flat display list with open and close marks, not a nested tree. It encodes with plain list recursion.

## Interpreter result (2026-11-12)

Built: [shell/interp.mjs](shell/interp.mjs) runs the toolchain's own data form of a module (`lexlean/semantic-module/2`, saved as [probe/Probe.json](probe/Probe.json)); [shell/wire.mjs](shell/wire.mjs) decodes the response; [shell/index.html](shell/index.html) draws it.

Measured, on one desktop Chrome, unthrottled, one run:

- The counter runs in the tab from the verified spec with no compile step. Real clicks work.
- Event to updated DOM, 200 events: median 0.1 ms, 95th percentile 0.2 ms, worst 1.5 ms. This times dispatch, decode and DOM writes, not paint. The timer's resolution is about 0.1 ms.
- Page load to first view: 30 ms from a local server.
- Interpreter plus decoder: 8.5 KB, 3.1 KB gzip.
- `node --test v2/shell/test.mjs`: 10 of 10 pass, including the example worked by hand in WIRE.md. A planted defect (quotient off by one) failed 6 of 10; restored, green.
- The hosted service answers browsers directly: no key, `Access-Control-Allow-Origin: *`. A check of this draft took 1.7 s round trip (one sample). So a tab can write a draft, check it and read back its data form with no server of ours.

Not shown:

- Agreement with the compiled guest. No holo was built, so the interpreter is tested against expectations written by hand, not against the projection that ships.
- Anything beyond a counter. The interpreter covers only the expression kinds and primitives this module uses, and refuses the rest with a typed error. `let`, `or`, `not`, strings and the wider primitive set are not implemented because their data form was not observed.
- Deep recursion. Long lists recurse on the JavaScript stack.
- Mobile, Safari, Firefox, throttled CPU.
- Keyed patching. The page updates words in place when the view's shape is unchanged and rebuilds otherwise.
- The meaning of the third argument of `quotient` and `remainder` (taken as the value for a zero divisor) is an assumption.

## What Hologram offers (studied at b6d9a76, 2026-11-12)

Read: Hologram-Technologies/hologram is a tensor engine plus a content-addressed substrate (store, container runtime, network, emulators) behind one "space" contract. Its speed comes from two ideas: identical work is addressed once and reused, and a pure function over a finite domain is materialized once as a table.

It is not a UI runtime. A Prism app's `step` and `view` are not tensor graphs, so dropping the engine in would add bytes and make nothing faster. `studio/PERFORMANCE.md` reached the same conclusion for inference.

Where the time actually goes, from this session's measurements:

| Stage | Time | Source |
| --- | --- | --- |
| Event to updated page (interpreter) | 0.1 ms median | measured, desktop Chrome |
| One display frame | 16.7 ms | fixed by the screen |
| Hosted check of a draft | 1.7 s | measured, one sample |
| Lean attestation | over 10 minutes | measured, two runs |
| Model writing the spec | not measured | expected to be seconds |

The interpreter is already 100 times under a frame. The latency a user feels is the model, the check and the attestation. So Hologram's two ideas should be aimed there, not at dispatch.

Adopt, as principles applied to specs and proofs:

1. Address every declaration. Key each definition and theorem by the content address of itself and what it depends on. Check and attest by declaration, not by module, and cache results by address. An edit then re-checks and re-proves only what it changed. The in-tab obligation cache already works this way; extend it to the hosted check and the Lean attestation. This is the largest available gain, because it attacks the ten minutes.
2. Share the cache. Proof results are public facts about public bytes, so a shared content-addressed cache (Hologram's HTTP gateway shape) lets one user's attestation serve everyone with the same declaration. Library modules would be proved once, ever.
3. Store by address in the browser. Use the content-addressed store over OPFS in a worker for specs, data forms and snapshots: synchronous reads, free deduplication, and undo, restore and share as a single address.
4. Compute ahead. `step` is pure and each button carries its event bytes, so while idle the shell can compute the response for every button on screen. A click then becomes a lookup. Not needed at 0.1 ms; worth it only when an app's `step` grows expensive. This is the finite-domain table idea applied to the events reachable from one view.

Do not adopt now: the tensor engine, the container runtime, the emulators, the network layer. None is on the path between a keystroke and a pixel.

Open: whether Hologram's wasm kernels make a local model fast enough to beat a cloud model's time to first token. `BENCHMARKS.md` reports kernel throughput, not end-to-end tokens per second in a browser. This needs its own measurement before any claim.

Not verified: items 1 and 2 need per-declaration verification from the hosted service, which today accepts whole projects. Whether it can be asked for one declaration is unknown.

## What PrismPM v0.4 offers (studied at 527cd58, release v0.4.0 of 2026-11-11)

This study corrects an earlier claim in this document. "There is no projector for an interactive view tree" is true only of the released application profile. The library already models most of what this design needs.

Read from `stdlib/src` and `CHANGELOG.md`:

| Need in this design | What v0.4 already has | State |
| --- | --- | --- |
| View over the wire | `Foundation.View.Browser.V1`: `Presentation` (a flat list of nodes with parent indexes), a closed `Content` union (section, navigation, form, heading, text, input, multiline, select, action, table, secret input), validity rules and limits, and a CBOR wire codec with a CDDL schema (`prismpm/browser-presentation/1`) | Modeled and verified. Not open to public applications |
| Events | `Intent`: revision, action id, bound field values, with `intentFits` checks | Same |
| Accessibility | `Semantics`: landmarks, input purposes, layout and appearance annotations | Same |
| Design tokens | `Design`, `HologramDesign`: 25 tokens per theme, contrast rules checked at admission | Same |
| Effects | `Foundation.Browser.Application.V1.Effects`: grants, `admitEffect`, `completeEffect`, typed failures | Same |
| Sessions, journal, recovery | `Session`, `SessionJournal`, `OperationJournal`, `Custody` | Same |
| Derived codec | `Foundation.Codec.Cbor.V1` and generated wire modules | Verified |
| Typed client from the model | `prismpm generate` and `prism-code generate` (JavaScript, Python, Rust) | Experimental |
| Proof statement in the holo | `prismpm verify` writes `proof-statement.json`; `check` reaches levels P1 and P2 with a named signer | Experimental |
| Local authoring loop | `prism-code dev`: rebuild and re-check on save, studio on port 4100 | Experimental |
| Features and journeys as declarations | `Foundation.Arch::Feature` and `Journey`, checked by `prismpm check` | Released |
| Capability sets, deny by default | `prism/capabilities/1`, `prism.toml` | Experimental |
| Faster verify | `docs/proposals/fast-verified-builds.md`: about 280 s today, under 60 s proposed, by content-addressed reuse | Proposed, not built |

The limit: the browser application profile is closed. `RELEASE-STATUS.md` says `PP2011` (browser application runtime unavailable) remains, because the pure session, presentation and storage parts do not yet add up to authenticated application execution and recovery. The released profile for an app is still the text application.

Where Foundry stands: `prismpm.lock` pins SDK 0.3.0 (image `cd3b47d7…`), not the v0.4.0 release. That image does carry the browser view library sources (seen at `/opt/prismpm/share/conformance-root/stdlib/src/Foundation/View/Browser/V1`).

Consequences for this design:

1. Drop the hand-written wire format in `probe/WIRE.md`. It reinvents `Presentation` and `Intent` with less: no forms, no inputs, no tables, no accessibility, no limits, no canonical encoding. The flat-list conclusion reached there independently matches the library's shape, which is some evidence the shape is right.
2. Keep projection B, but carry the library's protocol through it: a text application whose request is an encoded `Intent` plus state, and whose response is an encoded `Presentation` plus state and effects. The app stays inside the released profile, and moves to the browser profile with no model change when `PP2011` opens.
3. The model writes against `Content`, not against bytes. This removes the 120 lines of codec per app and gives a closed, small vocabulary for an LLM to target.
4. Use `Feature` and `Journey` declarations for Foundry's own journeys instead of inventing a format.
5. Use the effects protocol for store, infer, preview and publish instead of the probe's two ad hoc effects.
6. Move Foundry's lock to the v0.4.0 SDK. That is a template-governed change (`prismpm update --toolchain`), reviewed on its own.
7. The fast verified builds proposal reaches the same conclusion as the Hologram study above, from PrismPM's side: address work by its inputs and reuse it. It also lists what not to copy from Hologram. The per-declaration cache proposed here should build on that proposal, not beside it.

Not verified:

- Whether an app project may import `Foundation.View.Browser.V1` today (by copying the modules into `src`, as the template does for `Foundation.Bytes`) and still pass `prismpm verify`.
- The size and speed of the generated CBOR codec in a guest, and of an in-tab interpreter running it. The wire module alone is 1,869 lines.
- Whether the closed DOM adapter (DK-23) exists as shippable JavaScript or only as a test fixture under `tests/browser-view`.
- What changed in the browser library between the pinned image and v0.4.0.

## Decided: Foundry is a downstream consumer of PrismPM (2026-11-12)

Rule: Foundry writes no code for anything PrismPM or LexLean already owns. It imports the model, the codec, the effects protocol, the generated bindings and the build. Foundry's own source is its spec and the thinnest shell that PrismPM does not yet provide.

This is the repository's existing contract (`AGENTS.md`: use PrismPM only through the SDK image the lock pins; no vendored or handwritten copy of SDK behavior). The current studio breaks it by vendoring PrismPM's archive files; the first probe here broke it by hand-writing a wire format.

Shown: [probe-view](probe-view) is the counter rebuilt on the library. It imports `Foundation.View.Browser.V1.Model` and `Wire`, answers a `Presentation` to an `Intent`, and reuses the verified `Probe::step`. `lexlean check` in the pinned SDK image accepts all 9 modules. The app's own model is about 90 lines, with no codec in it. The full `prismpm verify` build is running; until it passes this is checked, not built or proved.

How consumption works today, and its two limits:

1. Library modules arrive by copy. LexLean has no package import for PrismPM's library, so the four modules were copied byte for byte out of the pinned SDK image into `src/`, as `prism-code init` does for `Foundation.Bytes`. A gate must compare each copy with the image, or the copies become a fork. Upstream request: a package import for library modules.
2. Updates arrive by a deliberate pin, not automatically. The SDK is pinned by digest so that a build reproduces and an attestation stays true. A new PrismPM or LexLean reaches Foundry when the pin moves (`prismpm update --toolchain`, or the template's update pull request), and every proof is then run again. That is one reviewed change for the whole upgrade, with no Foundry code to port. It is not silent, and it should not be: a silent upstream change would alter shipped bytes under an existing proof.

What stays Foundry's, because PrismPM does not have it:

- Foundry's own spec: its state, events, journeys and promises.
- The in-tab interpreter for instant preview. PrismPM builds; it does not interpret. This belongs upstream in `prism-code` once proven here.
- The shell that draws a `Presentation`, until PrismPM's closed DOM adapter (DK-23) ships as something an app can load.

What to request upstream instead of building here: opening the browser application profile (`PP2011`), a package import for library modules, a number-to-text function for `Nat` (the probe formats digits by hand because `format_decimal` takes `Int64`), per-declaration verification, and the fast verified builds proposal.

## Build attempts (2026-11-12)

Neither probe has built yet. Two failures, both informative:

- `probe-app`: `PP5007: application-lean timed out` after 11 min 39 s. It ran through a script copied from `build.yml`, with `/tmp` as a 2 GB in-memory file system, alongside a second build. PrismPM's own measurement says that setup is nearly three times slower than a cache volume. Rerun through `prism-code verify`, which uses the cache volume, one build at a time.
- `probe-view`: `PP2009`, refused in 53 s. The text application profile requires every response to be UTF-8. A CBOR frame is not. So a `Presentation` cannot cross today's profile as raw bytes: it travels as lower-case hex, which doubles its size (51 bytes become 102 for the counter). This is a real cost of staying inside the text profile and one more reason to ask upstream for the browser profile. The model now hex-encodes the frame; the 18 vectors were regenerated.

The four library modules were compared with the SDK image after `lexlean fmt --all`: unchanged.

## The library, interpreted in the tab (2026-11-12)

Built: the interpreter now runs a whole project, not one module. It loads the data form of all 9 modules of [probe-view](probe-view) (235 definitions, the library's 148-declaration CBOR codec among them) and the page [shell/view.html](shell/view.html) draws the result through [shell/render.mjs](shell/render.mjs).

The shell contains no codec. The intent is written by the library's `writeViewIntent`, the app answers through its `dispatch`, and the frame is read by the library's `readViewPresentation`, all three run by the interpreter. The page only moves bytes and draws nodes.

Measured:

- 18 of 18 acceptance vectors match. Their expected bytes were encoded by hand from `Wire.cddl`, independently of the model.
- The library's own `presentationValid` answers true for the counter's presentation at seven sampled counts.
- In Chrome, real clicks work. Action to updated page over 300 actions: median 2.1 ms, 95th percentile 4.4 ms, worst 14.7 ms. A build was using a full core at the time, so these are upper figures. Load to first view: 72 ms from a local server.
- The same dispatch in Node: 1.8 ms. The hand-written wire took 0.1 ms. The library's protocol costs about twenty times more and is still eight times under a frame.
- Data form of all 9 modules: 526 KB, 22 KB gzip. Interpreter plus renderer: 12.7 KB, 4.5 KB gzip.
- Fetching the data form of 9 modules from the hosted service: 10 s, one sample, sequential requests.
- `node --test v2/shell/test.mjs`: 13 of 13 pass.

Learned while building it:

- The data form has more than the first probe showed: `or`, `not`, boolean, string and fixed-width integer literals, matches on `Bool`, on `Result` and on a structure through its `.mk` constructor, and names qualified by module. All are now implemented.
- Three primitives the library declares are not implemented because nothing on this path calls them: `compare_bytes`, `format_decimal`, `parse_decimal`. The loader lists them and a call refuses with a typed error.
- The hosted service returned the data form of the library modules although its `prism-app` profile lacks their lexicon entries. So a tab can obtain the data form without a local toolchain, but a full check of a project that imports the library needs the SDK image today.

Not shown:

- Agreement with the compiled guest. The holo builds have not finished. Until one does, the interpreter is tested only against vectors written by hand.
- Content kinds beyond section, navigation, form, heading, text and action. Inputs, selects and tables are refused by name.
- The accessibility annotations and design tokens. Only the landmark labels and the live region are applied.
- Mobile, Safari, Firefox, and a quiet machine.

## The interpreter agrees with a shipped guest (2026-11-12)

Built: [compare/compare.mjs](compare/compare.mjs) sends the same requests through a holo's compiled WebAssembly guest (loaded and verified by `prism-code` 0.7.2) and through the interpreter running the data form of the same model, and requires every pair of answers to be byte for byte equal.

Run on PrismPM's own reference archive, `PaymentApproval.holo` (sha256 `8957bd15…`, 19 vectors, text application profile), with the data form fetched from `examples/PaymentApproval` at PrismPM `527cd58`:

- The guest replays its own 19 vectors: 19 of 19.
- The interpreter gives the recorded response for each: 19 of 19.
- The vectors the source's `application` declares equal the vectors the holo carries, so this data form is the model that holo was built from, as far as its vectors can show.
- A sweep of 10,685 requests no one wrote down (every one-byte removal, insertion, replacement and truncation of each vector, plus roles, amounts and limits around the decision boundaries): 10,685 of 10,685 agree. They cover all three answers: 8,150 invalid, 1,915 approved, 620 refused.
- Planted defect: making the interpreter accept a leading zero in a number made the comparison exit 1 on the vector `clerk 05 1000` and on sweep requests. Restored, exit 0.
- Per request in Node: guest 0.08 ms, interpreter 0.04 ms.

This required five primitives the interpreter lacked: `split_exact`, `parse_decimal`, `format_decimal`, `checked_subtract` and `compare_bytes` (the last is still not exercised by any comparison). Their behavior was taken from the compiler's own code generator, not guessed: `parse_decimal` accepts only the one canonical spelling inside the target width, which is exactly what the planted defect broke.

What this does and does not establish:

- Established: for one real, shipped, compiled app, the interpreter and the guest agree on every request tried. "Tested against vectors written by hand" is now "agrees with what ships" for that app.
- Not established: agreement for the counter probes, which still have no holo; agreement for the library's CBOR codec path, which this app does not use; agreement for all requests, since a sweep is a sample and not a proof.
- The comparison is the gate a preview needs: an app whose interpreter and guest disagree on any vector or sweep request must not publish.

`node --test v2/shell/test.mjs`: 14 of 14 pass.

## A real app on the protocol: payment approval (2026-11-12)

Built: [probe-payment](probe-payment) is a payment approval app with a form, a select, two text inputs, two actions and a table. Its decision is not rewritten: the model calls `PaymentApproval::dispatch`, PrismPM's own example, and shows the answer. Its own model, [Payment.lex.tex](probe-payment/src/Payment.lex.tex), is about 150 lines. [shell/app.html](shell/app.html) runs any spec that follows the convention `initial`, `step(state, intent)`, `view(state)`, `catalogue`; [shell/render.mjs](shell/render.mjs) now draws inputs, multiline inputs, selects, text selects and tables as well.

Proved: `lexlean verify --all` in the pinned SDK image verified all 9 modules, attestation `47e971f850de8a0c2ee6f613140445c02ef48f676723d8ea2f9acdcb6fef8284`, in 2 min 48 s. That covers the app's two theorems (the frame carries the state's revision; clearing advances the revision by one) and the library and example modules it imports, each with its exact axiom set.

So Lean verification does work locally, and in under three minutes. What times out locally is `prismpm verify`, the full build, in its runtime compile. The two were being conflated.

Tested (`node --test v2/shell/test-payment.mjs`, 6 of 6): the decisions match the example's rule; every frame over 40 actions is admitted by the library's `presentationValid`; the table keeps the newest sixteen rows; over-long text is refused and never shown back; a stale intent changes nothing.

Measured in Chrome with real typing, selecting and Enter to submit: 300 actions, median 1.2 ms, 95th percentile 2.7 ms, worst 12.4 ms from action to updated page. Load to first view 94 ms from a local server. In Node, `step` plus `view` takes 0.23 ms. This loop holds the state as a value and uses no wire codec, which is how the browser profile will run once it opens; the counter's 2 ms included the codec.

The 2 ms figure holds on a real view.

Not shown: the accessibility annotations and design tokens of the protocol (the page uses its own small stylesheet); secret inputs; a guest build of this app.

Notes:
- Three names were refused by the checker because Lean already uses them (`id`, `decide`, `take`). A model writing specs must be told this.
- `lexlean fmt --all` under the pinned compiler rewrote the copied `PaymentApproval.lex.tex`, so that copy is no longer byte for byte PrismPM's example at `527cd58`. The comparison in `compare/` used the unformatted original.

## The model loop: built, not yet run against a model (2026-11-12)

Built: [loop/loop.mjs](loop/loop.mjs) asks a model for a spec from one sentence and a fixed set of instructions ([loop/RULES.txt](loop/RULES.txt), 11.7 KB including one worked example), splits the stream into declarations as they complete, checks the module, asks for a repair with the diagnostics when the check refuses it (up to four rounds), fetches the data form, runs the first frame through the interpreter and the library's validity rule, and records the time of every stage.

Two findings before any model ran:

1. The hosted checker refuses any project that imports the library: `LLL1004`, because its `prism-app` profile lacks the lexicon entries the library modules' titles use. It answered in 1.6 s. So a spec written against PrismPM's content kinds cannot be checked in the tab today; the harness checks in the SDK image instead. This is the most important upstream request for the product: a hosted profile that carries the full library.
2. No model was reachable from a script on this machine. No API key is set, and the Claude Code program the desktop app ships answers "Not logged in" when run on its own. Signing in or entering a key is the user's to do. So time to first token, tokens per second and streaming render are still unmeasured.

## The model loop, run with an independent model (2026-11-12)

No model could be called from a script, so the loop was run by hand with an independent model: an agent given only [loop/RULES.txt](loop/RULES.txt) and one sentence, forbidden to read any other file, search the web or run a command. It could not see this repository's other specs, the checker or the interpreter. Its answers are kept as [loop/answers/guests-1.lex.tex](loop/answers/guests-1.lex.tex) and [guests-2.lex.tex](loop/answers/guests-2.lex.tex).

The sentence: "A guest list. The person types a name of at most 40 bytes and presses Add, and the name joins a table with one column, newest first, keeping at most 16. A Clear button empties the list. An empty name is ignored."

Round 1:
- The model wrote 10 declarations, 93 lines, in 33 s (the agent's whole turn, not a token timing).
- `lexlean check` in the SDK image accepted it on the first attempt, with no diagnostics. Check took 11 s; most of that is starting the container.
- The data form came back from the hosted service in 1.1 s.
- The first frame was admitted by the library's `presentationValid`.
- Exercised through the interpreter against the sentence: two adds give newest first; an empty name is ignored and the revision does not move; 41 bytes is ignored; 40 bytes of two-byte characters is accepted and 42 refused, so the limit is in bytes as asked; the table stops at 16; Clear empties it; a stale intent changes nothing. Every one of these held.
- In the browser, one thing was wrong: after Add the name box still held the name, so the next Add appended to it.

That fault had three owners, and it is worth being exact about them. The instructions never said what a field's draft epoch means, and the model flagged exactly that as ambiguous in its reply. The renderer ignored the epoch. And the checker cannot see it: the spec was well formed and its frames were valid. It was found only by using the app.

Fix: the renderer now resets a field when its value or its epoch changes, and the instructions state the rule.

Round 2: told only what a person saw ("the name box still held Ada"), the model changed one expression, the input's epoch, from 0 to the state's revision. Checked on the first attempt. In the browser, with real typing and Enter: the box empties after each add, the rows read Grace then Ada, an empty submit is ignored, and 300 actions took a median of 0.6 ms each.

What this establishes:
- A model can write a correct, checkable spec for a small app against PrismPM's content kinds from 11.7 KB of instructions and one example, with no access to the toolchain. One sentence, one check pass, one behavioural repair.
- The closed vocabulary works as intended: the model never wrote markup, styling or code, and everything it wrote was either accepted whole or would have been refused whole.
- The loop's stages after the model are fast enough: check 11 s cold in a container (1.6 s on the hosted service for a project it can read), data form 1.1 s, first frame 13 ms, each action under 1 ms.

What it does not establish:
- Anything about latency of the model itself: time to first token, tokens per second, and rendering while the spec streams are unmeasured, because no model was reachable from a script.
- Reliability. This is one app, one model, one run. A harder app, or a weaker model, may need many rounds or fail.
- Proof. The model was told not to write theorems, so this app is checked and tested, not proved. Having the model state properties, and the person approve them, is the next part of the loop.
- That a check pass means the app is right. The one real fault here passed every automatic gate.

`node --test v2/shell/test.mjs v2/shell/test-payment.mjs`: 20 of 20.

## Properties: the model's promises, proved by Lean (2026-11-12)

The instructions now ask a model for properties as well: a `promises` definition holding one plain sentence per property, then one theorem per promise, with the three proof forms that exist described (`reflexivity`, `linear_arithmetic`, `decide`) and the fact that there is no induction. The same independent model, under the same constraints, added them to its guest list: [loop/answers/guests-3.lex.tex](loop/answers/guests-3.lex.tex) as it wrote it, [guests-3.verified.lex.tex](loop/answers/guests-3.verified.lex.tex) as Lean proved it.

Result: `lexlean verify` in the pinned SDK image verified the project, attestation `8b8794d3da52312a7ec0ce85dab361b486d92c982428fcbb5ec9ba317042291c`, status `verified`, 632 declarations, each with its observed axioms. The five theorems:

| Promise, as a person reads it | Theorem | Proof form | Axioms observed |
| --- | --- | --- | --- |
| The guest list starts empty. | `startsEmpty` | reflexivity | none |
| Pressing Clear always leaves the guest list empty. | `clearEmpties` | reflexivity | none |
| An empty name is never added and changes nothing. | `emptyIgnored` | linear arithmetic | Quot.sound, propext |
| A name longer than 40 bytes is never added and changes nothing. | `longIgnored` | linear arithmetic | Quot.sound, propext |
| A press from an out-of-date screen never changes anything. | `staleIgnored` | linear arithmetic | Quot.sound, propext |

What it took after the model wrote it:
- One mechanical refusal at check: the names listed in a `linear_arithmetic` proof must be sorted. The harness now sorts them; no model round was needed.
- Three runs refused for a wrong axiom list, each naming one theorem. The harness corrected each from what Lean observed. No statement and no proof was changed by hand.
- Four Lean runs of 3.4 to 4.1 minutes, 15 minutes in all, because Lean reports one wrong axiom list per run. The harness now tries an observed set on the other theorems closed by the same proof form, which would have made this two runs.

The gap that matters. The model reported it itself, and it is real:

1. Promises 3, 4 and 5 are stronger than their theorems. Each theorem proves only that the revision number does not move. "Changes nothing" is an equation between records behind a condition, and none of the three proof forms can close it.
2. Promises 2 to 5 are proved about helper functions (`cleared`, `added`, `guarded`), not about `step`. `step` reaches a recursive function, which the arithmetic form cannot unfold. The model moved `step`'s body into `guarded` to make the proofs possible; behaviour is unchanged.
3. Four properties were left out because they need induction: the list never exceeds 16, a new name comes first, a name is added exactly as typed, and whole-state "nothing changes".

So today a sentence approved by a person can say more than the theorem under it. The product must not call such a promise proved without qualification. Two honest options: show the exact statement Lean proved beside each sentence, or hold the sentence to the theorem and refuse a promise whose theorem is weaker. Closing the gap for real needs proof forms LexLean does not offer here: induction over lists, and equality of records under a case split. Both are upstream requests.

Tested, to cover the gap on samples ([loop/test-guests.mjs](loop/test-guests.mjs), 9 of 9): each of promises 3, 4 and 5 in full (the whole state is unchanged, not only the revision), across seven states; the four properties left out of the proofs; frame validity; and the name box's draft epoch. Planted defect: raising the cap to 17 in the data form failed three tests, including the protocol's own validity rule; restored, green. In the browser, with real typing: unchanged behaviour.

Status of this app, in the words this project uses: checked by `lexlean check`; five theorems proved by Lean; the stronger readings of three promises and four further properties tested on samples, not proved.

All tests: `node --test v2/shell/test.mjs v2/shell/test-payment.mjs v2/loop/test-guests.mjs`, 29 of 29.

Repository gate on this branch, run in the pinned SDK image: `cargo fmt --check`, `xtask validate` (model, limits, deferral, bootstrap audits), `prismpm template check` and `prismpm lock check` all pass. Not run locally: clippy, the workspace tests, `cargo deny` and the app build, which is the step that times out on this machine.

## The counter's own guest agrees with the interpreter, on every state (2026-11-12)

The build-speed work produced the first probe holo: `Counter probe.holo`, sha256 `c9a7389e…`, 21,079 bytes, built from a copy of `probe-app` with its theorems moved into a separate module (the responses and all 14 acceptance vectors are unchanged). Checked here independently: `prism-code vectors` reports 14 of 14 with identities verified.

[compare/compare.mjs](compare/compare.mjs) then ran that holo's compiled guest against the interpreter on the data form of the same sources:

- The guest replays its own vectors: 14 of 14. The interpreter gives the recorded response for each: 14 of 14. The source's declared vectors equal the holo's.
- Sweep ([compare/sweep-counter.mjs](compare/sweep-counter.mjs)): every one of the 65,536 states (count and stride, one byte each) with increment, with reset, and with set-stride at four arguments, plus unknown event tags and one-byte mutations of the vectors. 395,625 requests, 395,625 agree, none differ.
- For increment and reset this is not a sample: it is the whole input space of the wire format. For set-stride it covers 4 of 256 arguments in every state.
- Per request in Node: guest 0.081 ms, interpreter 0.086 ms.

So for the counter, "the interpreter was tested against vectors written by hand" is replaced by "the interpreter agrees with the compiled guest on every state for two of its three events". Together with the Payment Approval comparison, the interpreter has now been held to two shipped guests.

Still not compared: `probe-view` and `probe-payment`, which run PrismPM's CBOR codec and have no holo yet. The holo itself is in the build-speed work, which is not part of this branch, so this comparison cannot be rerun from this branch alone until that work lands.

## The live site against this plan (2026-11-12)

Checked: https://uor-foundation.github.io/foundry/ after pull request 133 merged.

What the live site served: the existing studio at the root (its entry script is 1.93 MB), the kernel's Prism page under `app/`, and the second chat under `ui/`. Every v2 address answered 404. Merging `v2/` put the work in the repository and nowhere a person could open it.

Gaps between the live site and the plan in [PROMPT.md](PROMPT.md), and what was done about each:

| Plan | Live site | Now |
| --- | --- | --- |
| The browser runs the spec | Nothing of v2 was served | Closed here: [site/](site) is built by `site/build.mjs` and deployed under `v2/` by the Pages workflow. Open `v2/index.html`. |
| One thin shell, no framework, first-load code at most 60 KB gzip | 603 KB gzip for the home screen | Closed for the v2 page: 9.4 KB gzip of code for the gallery, 12.1 KB for the studio, 24 KB gzip of spec data. A test holds the 60 KB budget. |
| Proof speeds never blurred; the UI says what produced each badge | Not applicable | Closed here: beside each running app the page shows the attestation, the exact statement Lean proved for each promise, the proof form and axioms, where a theorem proves less than its sentence, and what is not proved at all. The page states that it does not check the attestation itself. |
| A sentence must not claim more than its theorem | Found in the model loop | Closed in presentation, not in proof: the page shows sentence and statement side by side and flags the three that fall short. A test fails if a "changes nothing" promise loses its flag. Proving them needs proof forms LexLean does not offer here. |
| The tab checks a spec with no local toolchain | Not possible | Closed here: [hosted-check/](hosted-check) is now in the repository and served as the studio. From the built site, press to verdict took 648 ms and press to first frame 876 ms (one run). |
| The evidence is in the repository | `v2/hosted-check` and `v2/build-speed` were untracked | Closed here: both are committed. `build-speed` carries the first probe holo, its sources, the report and the proposed workflow; its logs and the unchanged "before" copy are left out. |
| A model writes the spec in the product | Not present | Open. No model is reachable without a key the person supplies. The loop was run with an independent model outside the page. |
| Publish composes a holo from the page | Not present | Open. Holos are built by the SDK; the measured route is GitHub Actions (7 min 39 s cold, by the build-speed report). |
| Works offline after first load | Not for v2 | Open. Forge's worker owns the origin and answers v2 paths from the network. |
| The old studio is removed | Still the homepage | Open, and deliberately: it is the owner's decision, and the v2 page covers two apps, not the product. |
| The spec-only law and the budgets live in the kernel | Not modeled | Open. The budget is held by a test in `site/test.mjs`, not by a kernel requirement. |
| Foundry's own state and journeys are a spec | The v2 page's own behavior is handwritten JavaScript | Open. About 100 lines in `site/gallery.mjs` are not projected from a spec. |

One constraint found while doing this: Forge's service worker answers any navigation whose path has no dot with its own shell. So every link on the v2 site names a file, and a test refuses a link that does not.

Tested:
- `node --test v2/site/test.mjs`, 7 of 7: every app runs from the built files and its first frame is admitted by the protocol's own rule; every promise shown stands beside a theorem the served spec states; a weaker theorem carries its limit; the studio finds every library source; every link names a served file; the code stays inside 60 KB gzip; nothing but the listed files reaches the site.
- Planted defects: dropping the limit on one weaker theorem failed one test; linking to a folder failed another. Restored, green.
- The workflow step was rehearsed on a copy holding only the paths its sparse checkout fetches: tests pass, build succeeds.
- In the browser, served under `/foundry/v2/` as Pages serves it: the guest list with real typing and Enter (box empties, rows Grace then Ada, 0.9 ms); the payment app over 200 actions (median 1.0 ms, worst 9.8 ms); the studio's Check and run against the hosted service.
- All suites together: `node --test v2/shell/test.mjs v2/shell/test-payment.mjs v2/loop/test-guests.mjs v2/reuse/test.mjs v2/hosted-check/test.mjs v2/site/test.mjs`.

Not tested: the deployed page itself, which exists only after this change merges and the Pages workflow runs; Safari and Firefox; a phone.

## Direction: v2 lives inside Foundry's own app, not beside it (2026-11-12)

Decided by the owner: v2 must keep the look, the functions and the journey of the app at https://uor-foundation.github.io/foundry/ (sidebar, home composer, model picker, chat beside a live preview, publish). It should feel like Lovable. Models edit LexLean specs; the specs are projected into the live preview inside that app.

So the page under `v2/` is evidence, not the product surface. The product surface is the existing shell, and the v2 engine goes into it.

What the existing app already does (read in `studio/shell` at this commit):

- The chat model already writes LexLean. `prism.js` tells it to answer with one `<prism-lexlean>` block and streams it.
- The preview already draws from the spec as it streams. `host.js` (the `<prism-lexlean>` branch of the stream handler) reads whatever declarations are whole with `live/lexlean.mjs`, projects them with `live/project.mjs`, and posts `live/projection` to the live frame, which draws a closed set of node kinds with the kit's components (`live/components.js`).
- Proving already goes to the hosted service: `prism.js` writes a draft and calls `lexlean_verify` at `mcp.uor.foundation`. The phase shown is the kernel's answer (FK-01 to FK-04).
- A module that does not read gets one repair turn from the same model, streamed into the same answer.

So the journey the owner describes exists. Its limit is the shape of app it can express: `live/lexlean.mjs` reads one shape only, a decision (a request of fields, rules, a first-match `judge`, and `breaks…` properties). Its reader is a hand-written parser for that shape, and its preview is a projection of that shape. An app with state, a form that adds to a list, or a table is outside it.

What v2 adds, and where each piece plugs in:

| Step | Change | Where | Evidence it rests on |
| --- | --- | --- | --- |
| 1 | A second shape in the same block: `State`, `catalogue`, `initial`, `view`, `step`, then promises and theorems. The decision shape stays for "decide one answer". | the system prompt in `prism.js`, from `v2/loop/RULES.txt` | An independent model wrote this shape correctly from those instructions, first attempt. |
| 2 | When the block is the app shape, split it into whole declarations as it streams; once `State`, `catalogue`, `initial` and `view` are whole, fetch the data form and run it. | a new `live/app.mjs` beside `live/lexlean.mjs`, called from the same branch in `host.js` | `v2/loop/loop.mjs` splits declarations; the hosted service returns a data form in 0.2 to 1.1 s; the interpreter's first frame takes about 13 ms. |
| 3 | Draw the frame with the kit's own components, and send a pressed action back as an intent; the host runs `step` and posts the next frame. | a `live/presentation` message handled in `live/components.js`, mapping PrismPM's content kinds to the components the frame already has | `v2/shell/render.mjs` covers ten content kinds; an action reaches the page in about 1 ms. |
| 4 | Check at the end of the turn; a refusal becomes the existing repair turn, with the checker's diagnostics. | `v2/hosted-check/check.mjs`, called where `lexlean.withRepair` is called today | Same verdicts as the SDK image on 17 files; press to verdict 648 ms. |
| 5 | Prove with the existing path, sending the library modules with the app's. Show each promise beside the exact statement proved, and flag a theorem that proves less. | `prism.js` proof call; the frame's existing guarantees block | Lean verified the model-written app's five theorems; the v2 page already shows sentence against statement. |
| 6 | Hold the interpreter to the built guest before anything publishes. | the Publish panel's existing gate | `v2/compare/compare.mjs`: 395,625 of 395,625 on the counter. |

Nothing in the sidebar, the composer, the model picker, the chat, the panels or the appearance changes.

What will not be true at first, and should be said in the app:

- Publish for the app shape. A holo of a stateful app needs the text-application wrapper and a build of about eight minutes on GitHub. Until that is wired, the app shape previews and proves; it does not publish. Decision apps publish as today.
- Proof strength. Without induction, some promises can only be tested. The app must show which.
- Model quality. The app shape was written correctly by one strong model. The app's default cloud model has not been tried on it.
- Speed while streaming. Each partial render needs a data form from the hosted service; one sample each of 0.2 and 1.1 s. If that is too slow to feel live, the data form must be produced in the tab, which needs LexLean's reader compiled for the browser (an upstream request).

Order of work: steps 1 to 3 give a stateful app appearing in the existing preview while the model writes it. That is the first thing worth showing, and it touches three files of the studio plus one new one. Steps 4 to 6 make it trustworthy. Each step lands with the studio's own gates extended (the journey check, the contract check, the performance budgets), a planted defect, and a browser run of the real journey.
