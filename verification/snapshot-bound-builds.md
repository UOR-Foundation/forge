# Snapshot-bound builds (FA-26)

Authority: `app/src/FoundrySpecification.lex.tex::snapshotBuildBoundary`.
The ID, scenario and missing-test red gate were registered before implementation.

Preview and portable publication now build from one captured source instead of
reading files and metadata across separate transactions. Snapshot restoration's
independent identity, basis and generated-core admission checks validate the
capture. Exact name, file bytes and declared direct dependencies must agree.
Before promoting a preview or installing an archive, the current source is
compared with the capture. The portable receipt names that captured reference.

Portable publication previously used cached rule state to detect a rule-based
app. Spec edits clear that cache. The route now examines the captured files:
any `prism/spec.json` requires the rule/Prism SDK route, including malformed or
unchecked specs, so cache invalidation cannot bypass rule publication.

Six Node controls execute the pure checker and actual host publication adapter.
The browser gate uses real Chromium IndexedDB and independent preimage fixtures
to check exact captures, unsealed files, corrupted file objects, mismatched
dependency metadata, source changes, generated-core refusal and deletion.
Three planted defects fail the unchanged oracles: dropping file comparison,
disabling stale-source comparison and routing specs through portable publishing.
All restored controls pass. All 149 Node tests, the full local Rust workspace,
Clippy, parser inventory and renderer contract checks pass.

`buildSourceMismatch` and `buildSourceChanged` have fixed public messages.
Snapshot validation, project storage and direct dependency errors retain their
existing typed boundaries. A source deletion is a changed-source refusal.
The storage and cache systems do not provide one joint transaction: the final
source check is a promotion guard, not a claim of cross-store atomicity.
Remote dependency authenticity, browser compiler preservation, complete release
closure and full application conversion are not established here.

The separate kernel reproduction completed while this feature was developed.
Signed runs 43033504480 and 43035286261 produced identical 385046-byte archives;
both exact-source/workflow signatures verified. Updated reproduction evidence
is committed with this feature and does not claim whole-application reproduction.

Full immutable SDK and Studio acceptance at this feature revision remain pending.
