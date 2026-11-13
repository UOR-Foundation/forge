# Verified shell installation (FA-29)

Authority: `app/src/FoundrySpecification.lex.tex::shellClosureBoundary`.
The ID and scenario preceded both missing-oracle Node and Rust failures.

The worker independently recomputes the pinned manifest closure, verifies every
file length and SHA256, and only then writes the version cache and requests
activation. Invalid responses, redirects, manifest/path shape, hashes, lengths,
limits, timeouts and cancellation refuse installation with fixed typed failures.
Cache write failure prevents activation and exposes no storage exception detail.
The verifier bounds the manifest, file count, individual and aggregate bytes,
concurrency and preparation deadline. Successful installation uses the existing
browser worker lifecycle; a partial cache write does not imply transactional
CacheStorage, but cannot introduce unverified bytes or activate that version.

The projector now includes renderer assets, scaffold and the fallback document.
CI builds/stages the locked renderer once before the lane computes closure and
provenance. An independent inventory checker requires every staged file in the
manifest, then invokes the actual worker verifier. The separate `app/` site,
worker/manifest circular inputs and deployment credentials remain explicitly
outside this closure. Controlled renderer/scaffold reads use the active version,
including offline requests; unknown assets return 404 instead of borrowing a
newer network version. Activation alone removes previous shell caches.

Six Node controls cover exact bytes (including BOM), independent staged inventory,
manifest/file/provenance mutations, paths/schema/limits, private failures,
stalled headers/bodies/hash computation, cancellation, eight-request concurrency,
actual worker activation/cache-failure ordering, and CI/projector/parser binding.
Real Chromium installs the actual worker template, refuses a corrupt update,
retains the previous renderer and scaffold offline, refuses unknown assets,
recovers with a valid update, and removes the previous version. Verifier fetches
forward zero cookies. The browser fixture isolates cache behavior; its placeholder
core bytes are not evidence of generated core execution.

Seven planted defects were rejected and restored: bypassed file identity,
bypassed manifest identity, redirect following, excessive concurrency, incomplete
staged inventory, network assets replacing active-version cache reads, and ignored
cache-write errors. Node controls reject the first five and the last;
`verified_shell_cache_browser.mjs` rejects mixed-version network retrieval.

The fully built local shell exposed a real ordering mismatch: Rust PathBuf ordering
places directory components differently from portable string byte order. The
projector now sorts normalized path strings. Its 348 files (23,097,834 bytes at
the measured local build) pass independent inventory and hash verification.
All 167 Node tests, full local Rust workspace, Clippy, renderer boundary/contracts,
parser, Studio core tests and generated wasm corpus pass. Supplementary diagnostic
verification checks 12 modules, attestation
`86baf6a619564f045995434f75fc8e3005d3160fcb141bb6f0db771e3039f847`.
Full immutable-SDK and Studio feature CI remain pending at the initial revision.

The existing full live-preview journey ran with the built renderer, generated
Studio core and signed kernel. It reached checking/edit/refusal/reword/undo with
one frame load, zero reloads and no page exceptions. It FAILED the unchanged
edit-latency budget: 41.7 ms maximum against two 16.7 ms frames (33.4 ms).
First-node paint was 16 ms, checking 28 ms, and stream patch work at most 9.8 ms.
This is a recorded performance failure, not accepted end-to-end quality. The local
receipt explicitly identifies diagnostic scope and has no build attestation;
it is not deployment or publication evidence. This run also exposed unsolicited
renderer telemetry requests for a subsequent privacy correction.

Installation consistency does not authenticate the server/worker, establish full
production dependency or compiler provenance, eliminate first-navigation races,
or qualify the entire release. The existing Studio lane's Git production
dependencies and legacy vendored toolchain remain separately open obligations.

## Controlled navigation repair

An already-controlled root or renderer-route refresh could miss the cached
`index.html` key and load the newest network HTML while its renderer came from
the previous active closure. A refused update did not resolve this mismatch.
FA-29 now binds shell-document GET navigations to the active index, preserving
query strings in the navigation URL and serving its cached headers unchanged.
Missing active HTML returns 404 rather than borrowing a different version.
Exact cached resource/document responses remain unchanged. Preview, published
application, app/ui subapps, engine/API and static-resource namespaces retain
their separate handling; requests outside the worker base are not intercepted.

The renderer's existing not-found redirect and Pages' `404.html` fallback mean
that a closed list of renderer routes would repeat the defect for new routes.
The repair therefore covers unknown shell routes too, with explicit namespace
exceptions. `/chat` is the build screen; `/q/` carries the engine assets.
This is not a claim that worker activation is atomic for already-running clients,
that partial CacheStorage writes roll back, or that the JS adapter is generated
Prism implementation.

The model/scenario regression ran against the original routing and failed with
`NETWORK B` instead of `HTML A`. Seven shell Node tests pass after repair;
the full local Studio Node suite passes 194/194, with no skipped/cancelled/todo
tests. The shell parser and browser fixture syntax check also pass.
Four planted defects fail the new control and were restored: bypassing document
binding, limiting binding to a few known routes, swallowing the engine namespace,
and fetching network HTML when the active document is absent. The restored
seven-test suite passes. These checks used
`node --test studio/tools/verified_shell_cache.test.mjs`,
`node --test studio/tools/*.test.mjs`, and `node studio/tools/shell_parse.mjs`.

The real-browser fixture now loads a generation-marked HTML document and executes
its renderer. It navigates and reloads root, chat, nested and unknown routes with
A active, after B is refused online and offline, and after valid B activation
online and offline. It also retains the existing corrupt-update, offline asset,
missing-file, cache cleanup and omitted-cookie assertions. This expanded browser
fixture has not run locally: browser launch is blocked in this environment and
was not retried. Its required Studio CI execution remains pending.
`just model-write` and `just vv` also remain unrun because the immutable SDK tools
(`just`, Cargo and PrismPM) are unavailable here; CONFORMANCE.md was not manually
edited. This local result is not complete release acceptance.
