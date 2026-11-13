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
