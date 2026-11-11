# Bounded portable build modules (FA-27)

Authority: `app/src/FoundrySpecification.lex.tex::buildModuleBoundary`.
The registered scenario and missing-test red gate preceded implementation.
The first five module controls passed before the sixth host-wiring control was
implemented; all six pass after integration.

Portable builds retrieve JavaScript/CSS only from the declared `https://esm.sh`
origin. URLs cannot carry credentials or fragments. Requests omit browser
credentials, refuse redirects and bypass HTTP cache. The complete module
operation has a 120-second maximum deadline, 512 distinct URLs, 8 MiB per module
and 64 MiB aggregate. Duplicate requests share their in-flight result. Failed
status, media type, encoding, identity, limits and transport have fixed typed
errors; error bodies are not returned. A closed operation cannot start new
requests, and late headers after failure have their bodies cancelled.

Exact UTF8 bytes, including BOM, are retained with independently recomputable
SHA256 identities. The portable view includes `build/modules.json` and each
unique source under its digest path. This records the bytes actually retrieved;
it does not authenticate a package publisher or establish a transitive NPM lock,
compiler/toolchain closure, complete application fidelity or physical termination
of already executing compilation.

Six Node controls cover origin/options, duplicate work, byte identity and exact
closure, private failures, all limits, stalled headers/bodies/callbacks,
cancellation, late cleanup, closed-operation refusal and actual host wiring.
Real Chromium HTTP tests verify redirect refusal, zero forwarded cookies, fatal
UTF8, two aborted body streams and independent byte/hash equality. Their local
transport retains production fetch options; it is not a live esm.sh availability
or TLS test. The initial cookie count included an unrelated browser favicon
request; the fixture now counts only its declared transport endpoints and
requires exactly five such requests.

Five planted defects fail the controls: accepting other origins, following
redirects, including credentials, removing the per-module bound, and returning
the wrong deadline failure. Every mutation was restored. The complete Node,
browser, Rust workspace, Clippy, parser and renderer contract gates pass locally.
Full immutable SDK and Studio acceptance remain pending at the initial feature
revision; diagnostic model verification is supplementary only.
