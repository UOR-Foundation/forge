# Local editor closure (FA-31)

Authority: `app/src/FoundrySpecification.lex.tex::editorAssetBoundary`.
The registered ID, scenario and failing missing-oracle Rust test preceded the
implementation. The previous Settings browser probe exposed four unhandled
errors when its eager Monaco CDN loader was blocked.

The owned renderer bootstrap configures the actual imported loader before the
renderer imports. Monaco 0.52.2 is staged from its production lock's exact npm
archive using offline npm transport, disabled scripts and a 60-second deadline.
An independent SHA512 comparison precedes bounded gzip/tar parsing. Portable
paths, archive kinds, duplicates, package identity, required assets and licenses
are checked. Limits are 32 MiB compressed/member, 256 MiB expanded, 16384 archive
entries, 4096 staged files and 64 MiB staged bytes. Fixed typed errors cover lock,
availability, integrity, archive, limit and storage failures. Staging failures
fail the build; directory replacement is not claimed to be atomic.

The independently reacquired archive supplies the second check's expected bytes,
so coordinated mutation of a staged file and its receipt cannot pass. The editor
loader and receipt are required shell entries; all editor requests use the active
verified shell version. Both Studio and Pages run independent staging checks.

Six Node controls cover schema, exact bytes/receipt, corruption/traversal/links,
all size/count bounds, storage/transport failure and build/cache wiring. Six
planted defects were rejected: skipped archive SHA512, admitted links, removed
compressed bound, skipped independent byte comparison, CDN loader URL and missing
active-cache editor branch. Commands were `python3
studio/tools/editor_assets_cases.py <case>` and `node --test
studio/tools/local_editor_closure.test.mjs`. Each mutation was restored and all
six controls passed again.

Actual Chromium acceptance uses the built renderer, core and verified service
worker. With networking offline, Settings opens, Monaco edits a JSON model and a
real worker validates invalid then corrected JSON. Worker resource timing confirms
`jsonWorker.js` came from the same-origin editor closure. An unknown editor asset
returns 404. No unexpected external requests or page exceptions occur; decorative
background requests remain separately observed and blocked. The privacy Settings
test no longer replays a CDN fixture. An initial test used an incorrect Monaco API
name; the corrected test uses the installed package's `json.getWorker`. Keeping
the mounted model alive until browser close avoids test-induced cancellation of
pending language features during disposal.

All 179 Node controls and local workspace Rust/Clippy pass. The real staged
closure has 455 files and 37118364 bytes, including 105 editor assets/licenses;
independent verification passes. These local browser receipts are explicitly
unattested diagnostics. Supplementary LexLean verification of all 12 modules
produced attestation
`ccc77221e1b4a0b550f9e647788cddbcfb7dd3e5ca1215cc5c2fef5832ab7220`.
Full immutable-SDK and Studio acceptance must be recorded at the published head.
This qualifies local editor loading, not Monaco semantic correctness, upstream
publisher identity, or complete application dependency/release closure.
