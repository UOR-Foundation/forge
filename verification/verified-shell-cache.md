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
