# Local browser compiler (FA-32)

Authority: `app/src/FoundrySpecification.lex.tex::compilerAssetBoundary`.
The ID/scenario and failing missing-oracle Rust test preceded implementation.
Preview and publication previously imported esbuild-wasm JavaScript and WASM
from a CDN at runtime, outside the verified shell inventory. A rejected
initialization promise also remained cached and poisoned subsequent attempts.

`runtime/package-lock.json` now locks the existing compiler version 0.25.5 as a
production dependency with no transitive packages. The package staging adapter
shares FA-31's bounded archive verification with an explicit compiler profile.
It independently compares archive SHA512, checks package identity and retains
only the real LICENSE.md, browser module and WASM. Both workflows install the
locked package with scripts disabled and independently compare staged bytes to
the reacquired offline npm archive. Compiler entrypoints join required shell
admission, and worker reads use the active verified cache.

The host's preview and publication paths use the same local compiler loader.
Concurrent calls share initialization; failed imports or WASM initialization
clear the failed promise and return a fixed private browserCompilerUnavailable
error through the actual host envelope. The imported compiler retains its
own semantics and source diagnostics.

Six controls cover an independent archive fixture, missing license/WASM, altered
bytes and package identity, exact local URLs, concurrent initialization, import
and WASM failure recovery, typed host errors and required workflow/cache wiring.
All six planted defects failed `node --test
studio/tools/local_browser_compiler.test.mjs`: skipped SHA512, omitted required
license, CDN import, poisoned promise, lost typed error and missing active-cache
branch. Each was restored and the six controls passed again. Existing editor
archive limits, path/type controls and offline acceptance still pass.

Real Chromium runs the actual locked WASM compiler under the verified worker
with networking offline. TypeScript transformation and a bundled two-module graph
both execute to the independently expected value 42; malformed source refuses.
A real missing local module import refuses, then a valid retry initializes.
Worker resource timing observes the local compiler WASM, with zero page errors.
The staged closure independently verifies 460 files and 49320698 bytes. Local
provenance is explicitly diagnostic, not release attestation.

All 185 Node controls, local Rust workspace and Clippy pass. The first full Rust
run caught a missing scenario ID tag; it was corrected and the full run passed.
The renderer bundle is byte-identical to FA-31 because no renderer source changed;
the new shell host/compiler code is independently parsed and browser exercised.
Full immutable-SDK and Studio acceptance is recorded at the published revision.
This establishes compiler availability and finite runtime examples, not general
compiler preservation, offline dependency resolution or complete app closure.

Supplementary host diagnostic: verified 12 modules; attestation c80c5cbb957e41779b4e8cede743ca8585cf22cd244b966933853279bfdbc9de. This is not the locked SDK acceptance gate.

## Pages archive-cache prerequisite repair

The Pages optimization could restore `runtime/node_modules` and the renderer
bundle while npm's archive cache lacked esbuild-wasm. A real npm reproduction
with an isolated empty cache and an unpacked esbuild-wasm package fixture failed
with `compilerPackageUnavailable`. Unpacked dependencies are not archive authority.

Dependency preparation now independently verifies both locked asset archives
before shell stamping, even on modules/bundle cache hits. Only an unavailable
archive triggers `npm cache add` of the existing policy's exact, lock-validated
registry URL, with scripts disabled and a 60-second deadline. The result is
reacquired through the unchanged offline loader and checked for SHA512, package
identity, bounded archive structure and required members. Invalid locks or
successfully acquired but corrupt archives refuse without a hydration retry.
Staging, independent verification and shell closure are unchanged. The setup-node
npm cache identity now includes both runtime and renderer lockfiles.

Seven preparation controls cover a real isolated empty-cache reproduction,
missing archive hydration/reacquisition, verified reuse without hydration,
corrupt cached and downloaded archives, invalid lock authority, and failed
hydration. These execute from the FA-32 Node test and its seven-test Rust wrapper.
The workflow control requires both lock inputs and an unconditional preflight
within the non-reused Forge build before stamping. Existing FA-31/FA-32 archive
adversarial controls remain in force.

Five representative planted defects were rejected by
`node --test studio/tools/local_browser_compiler.test.mjs`: removing the runtime
lock from the npm cache key, skipping preparation on a modules hit, accepting an
unavailable archive, omitting post-download verification, and retrying an
integrity failure as a cache miss. Each mutation was restored before retesting.
This repairs prerequisites for the existing compiler/editor boundaries; it adds
no compiler semantics or alternative archive authority.

Local qualification also started with a fresh real npm cache, fetched both exact
production archives through this preflight, and successfully verified them again
with `npm_config_offline=true`. The combined compiler/editor, Pages source/live
identity, canonical-generation and backlog suites passed 36 tests with no skips.
The FA-32 Rust wrapper compiled directly with Rust 1.97.1 and passed. This is
focused diagnostic evidence, not full SDK acceptance: the offline Cargo run
lacked `toml_parser`, and this environment has no Docker for the immutable SDK's
`just vv` boundary. Full acceptance must run on the final integrated revision.

Independent review caught a vacuity gap in the preparation subprocess gate:
Python's unittest exit status alone accepts empty and entirely skipped suites.
The preparation runner now reports actual tests, skips, errors, failures,
expected failures and unexpected successes. Its Node caller requires exactly
seven tests and zero for every other count. Two negative controls execute the
real runner with an empty suite and with all seven cases skipped; both Python
processes exit successfully, and the Node caller rejects both receipts. The
outer seven-test FA-32 wrapper cannot count either case as preparation success.
