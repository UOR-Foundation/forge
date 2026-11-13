# Prompt: rebuild Prism AI Foundry from one verified LexLean spec

Paste everything below the line into a coding agent that has run `npx prism-code@latest setup`.

---

## Role

You are the lead architect and implementer of Prism AI Foundry v2.
Work as a co-pilot: state the plan, share progress, surface every assumption, push back when a requirement is wrong.

## Objective

Rebuild Prism AI Foundry (https://github.com/UOR-Foundation/foundry) so that the whole product is a projection of one canonical LexLean model, verified in Lean 4.
The user experience must match Lovable.dev or Google AI Studio: type a sentence, watch a live app appear, iterate by chat, publish to a link.
It must run in any modern browser from a static host, with no server of its own, and feel instant.
Lean, fast, secure and auditable are the four tests of every decision. Delete anything that fails them.

## What exists today (measured at commit 8053eb5, 2026-11-12)

Read these before writing anything: `AGENTS.md`, `README.md`, `VERIFICATION.md`, `studio/README.md`, `studio/PERFORMANCE.md`, `studio/UPSTREAM.md`, `app/src/FoundrySpecification.lex.tex`, `app/src/ForgeKernel.lex.tex`, `openspec/specs/forge-kernel/spec.md`.

- The proved part is small: `app/src`, about 4,800 lines of LexLean, a phase machine (drafting, checked, proving, proved, published) and a deny-by-default capability gate, FK-01 to FK-21.
- The product is not proved. It is a vendored Electron app (`studio/vendor/dyad`, 2,131 files, 535,000 lines, React), run in the browser by a 1,636-line `studio/shell/host.js` that imitates `window.electron`.
- Around it: Hollama as a second chat UI, a vendored shadcn copy, Python scripts that write the `.lex.tex` files, zod contracts published only to police the imitation, and gates whose job is to keep vendored bytes from drifting.
- Cost: 603 KB gzip of JavaScript for the home screen, cold mobile LCP 9.6 s, Enter to first token 2.8 s on a phone.
- Worth keeping: the kernel and its proofs, `FoundrySpecification` (15 obligations that already describe the target), the holo format and composer, the service worker as origin kernel with a CSP sandbox for previews, content addressing (BLAKE3), the in-tab proof obligations (`studio/shell/live/obligations.mjs`, sound by `regionCheck_sound`), passkey identity, the template contract and `just vv`.

The diagnosis: authority and product are two codebases joined by adapters. Under one percent of the code is verified, and most of the rest exists to adapt a desktop app to a browser.

## The design to build

Invert it. The model is the application; the browser is a small interpreter.

1. One model, Elm-shaped. In LexLean define `State`, `Event`, `Effect`, `View`, and two total functions: `step : State -> Event -> State x List Effect` and `view : State -> View`. Every screen, word, transition, permission and budget lives there. Extend the existing kernel; do not start a second authority.
2. One projection. Compile the model to Rust and wasm32 through the existing lane (LexLean, Lean 4.32.1, lean4-prod, twice and byte identical). The wasm core runs in a worker. Generate the TypeScript types for `Event`, `Effect` and `View` from the model, so no handwritten contract layer exists.
3. One thin shell. A generic renderer draws any `View` to the DOM with keyed patches, and an effect interpreter performs the declared effects (storage, inference, preview, publish, identity) and returns results as events. No framework, no router library, no state library. Target under 2,000 lines of handwritten JavaScript, no dependency in the first-load path.
4. LLMs write spec, never code. This is the product's central law.
   - The only thing an LLM may produce is LexLean source: types, rules, `step`, `view`, and the properties to prove. It is untrusted; the kernel admits its output only after check (`ProposalAdmission`).
   - Every shipped byte is a pure function of two digests: the spec and the projector. Same spec, same projector, same bytes, on any machine. Record both digests in the holo.
   - State it as a kernel requirement with a theorem and a gate: no artifact, preview or published file contains a byte that did not come from a projector run on an admitted spec. Plant the defect (a hand-edited or LLM-written output file) and see the gate refuse it.
   - Projectors are the "any code" part: one per target (the in-tab interpreter for preview, wasm, Rust, TypeScript bindings, HTML). Each is deterministic, pinned by digest, run twice and compared byte for byte, and tested against the in-tab interpreter on the spec's acceptance vectors. A projector is trusted code until it has its own preservation proof; list each one in the trusted base and say which have proofs.
   - A generated app is a model plus a `View`, the same shape as Foundry, so one renderer draws both. Foundry is the first app built this way.
   - Reuse happens at the spec level: a library of verified LexLean modules the LLM imports (`FeatureComposition`), not a library of code.
   - What an app can be is whatever LexLean can express. When a request exceeds it, refuse with a typed reason naming the missing construct, and file it as a language request. Never fall back to written code.
5. Three proof speeds, never blurred.
   - Instant, in the tab: the decision procedure over the app's rules, proved sound once in Lean, with results cached by the content address of each obligation, so an edit re-checks only what changed.
   - Check, seconds: `lexlean check`. Hosted today; in the tab once LexLean compiles to wasm32 (request already filed in `studio/UPSTREAM.md`).
   - Attest, about a minute: the Lean kernel and leanchecker with exact axiom sets, on the hosted verifier or the repository's GitHub Actions, verified again in the browser on return.
   The UI shows which speed produced each badge. FK-01 already forbids "proved" without the attestation; keep it so.
6. Preview without a build. The preview is the interpreter projection: it runs the checked spec directly in a sandboxed, opaque-origin frame served by the worker, deny-by-default network. As the LLM streams the spec, each declaration is checked and rendered when it completes, so the app appears while it is being written. Publish is the only step that compiles: it composes a holo and verifies it before it gets a link.
7. Inference behind one port. A provider interface with two adapters: the visitor's own key to a cloud endpoint, and a local WebGPU model. Stream structured output and project it declaration by declaration as it arrives. Keys stay in the device store, unreachable from previews.

## Remove

- `studio/vendor/dyad`, the `window.electron` host and its zod contract policing.
- Hollama (`studio/shell/ui`) and the duplicate chat.
- React, framer-motion, lexical, Monaco, shiki, the markdown pipeline and every CDN fetch.
- The Python authoring scripts: the `.lex.tex` files become the hand-owned source.
- Electron-era features with no browser meaning: Supabase, Neon, Coolify, GitHub ops panels, templates, plugins, telemetry.
- Every gate that only guards vendored bytes that no longer exist.
- Decide with evidence whether the 6.8 MB Q engine stays on the first-run path or loads only when the local model is chosen.

Record each removal with the claim it retired. Removing a feature must remove its claim, test and words in the same change (R1, R4).

## Budgets (propose, then fix them in the kernel before building)

- First-load JavaScript at most 60 KB gzip; wasm core at most 150 KB gzip.
- Cold mobile LCP at most 2.5 s on Slow 4G with 4x CPU; warm at most 1 s.
- INP at most 100 ms; event to patched frame at most 16 ms on desktop.
- Edit to instant re-check at most 50 ms; Enter to request sent at most 100 ms.
- Fully usable offline after first load, except inference and attestation.

These replace FK-12 to FK-15 and are enforced by the same Performance gate. Measure Chrome, Safari and Firefox.

## Security and audit requirements

- One typed command boundary: nothing changes state except `step`.
- Deny by default for network, storage and publication; a denial beats a grant (FK-05 to FK-09).
- Untrusted content (model output, previews, installed apps) never shares an origin with keys or project data.
- Every identity names its kind, canonical form, algorithm, digest and version.
- Locked production dependencies only; reproducible build; signed provenance; a release receipt binding model, source, toolchain, artifacts and destination.
- Every public failure is typed, modeled and has a negative test (R5). No empty success standing in for an unsupported feature.
- An auditor should be able to read the whole trusted base in a day: the model, the renderer, the effect interpreter, the worker.

## Method

Use the tools `setup` installed.

- `lexlean` MCP: `lexlean_profiles` (profile `prism-app`, language 1.2), `lexlean_lexicon_search`, `lexlean_draft_assemble`, `lexlean_check`, `lexlean_format`, `lexlean_explain`, `lexlean_verify`. Copy syntax from the existing modules; never guess it.
- `prism` MCP guided path (`prism_start`, `prism_spec`, `prism_build`) covers only apps that decide one answer from a line of fields. Foundry is not that shape, so build Foundry by the manual path; use the guided path as the engine for the apps Foundry generates.
- Gates, cheapest first: `npx prism-code build --check`, `verify --lean`, `axioms --write`, `verify`, then `just vv`. No Docker: `npx prism-code build --remote github`.
- Follow `AGENTS.md` R1 to R6. Each capability starts as an ID, a scenario and a failing test; each gate is armed by a planted defect.
- Keep sources LF. Never edit files pinned by `template.lock` or anything under `prism/` by hand.

## Order of work

1. Write `ARCHITECTURE.md`: the model's types, the effect list, the trust boundary, the deletion list, the budgets, and every open question. Stop for approval.
2. Model the shell: `State`, `Event`, `Effect`, `View`, `step`, `view`, with theorems for the journeys (create, edit, preview, verify, restore, cancel, recover, publish). Verify.
3. Walking skeleton: wasm core in a worker, renderer, effect interpreter, service worker. One sentence in, one proved decision app out, live preview, published holo. Measure against the budgets.
4. The spec-only law as a kernel requirement with its gate; the projectors; the spec module library; the inference port with both adapters.
5. Delete the old studio in one change once the skeleton passes every journey.
6. Harden: accessibility, three browsers, offline, planted defects, release receipt.

## Constraints on honesty

- Say "proved" only for what Lean's kernel attested, "checked" for the in-tab procedure, "tested" for vectors, "measured" for budgets.
- Lean does not run in the browser today. Do not claim it does; design so it can when upstream allows.
- Lovable parity means the journey and its speed, not arbitrary code generation. An app LexLean cannot express is refused with a typed reason, never written as code.
- A proof covers the properties the spec states, not the user's intent. The LLM drafts the properties, so the user must read and approve them in plain words before anything is called proved.
- "Instant" describes the in-tab check and the preview. The Lean attestation takes about a minute and arrives after; the preview stays usable and labelled "checked" until it does.
- Measure first whether LexLean 1.2 and the current lane can express and project a full interactive `View`. If not, say what is missing before designing around it.
- If a requirement here conflicts with what you measure, say so with the number.

## Deliverables

- `ARCHITECTURE.md` and the decision log.
- The LexLean model, its proofs and attestation IDs.
- The shell, with size and timing reports against the budgets.
- A before and after table: files, lines, trusted lines, first-load bytes, LCP, INP, first token.
- A live URL, the holo fingerprint, and the count of replayed examples.
