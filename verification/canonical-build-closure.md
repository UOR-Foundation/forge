# Canonical build closure (FA-38)

Authority: `app/src/FoundrySpecification.lex.tex`, `canonicalBuildBoundary`
and `CanonicalBuildError`.

Content identities alone allow an imported or restored snapshot to carry a
changed rule runtime alongside its original model. The common build capture
boundary now checks the bounded decision specification, reconstructs its active
canonical module and runtime, and requires exact recorded bytes before preview
or portable build effects. A fixed private `canonicalBuildMismatch` refusal
covers invalid or inconsistent decision projections. Ordinary projects retain
their build path. Drafts remain importable and editable for repair.

The registered ID, scenario and missing-oracle Rust failure preceded the
implementation; initial Node execution also failed on the missing module.
All 230 combined Node controls, local Rust workspace tests, Clippy, formatting
and shell parsing pass. Six restored mutations fail assertions: unchecked
module, unchecked runtime, replaced semantic checker, removed size bound,
removed capture check and lost public error code. An initial mutation removing
only the redundant `ok` check survived because a failed checker returns no
runtime; the stronger checker-substitution mutation and contradictory-model
fixture establish the semantic negative control. No surviving mutation is
reported as a rejected defect.

Real Chromium executes actual imports, host build entry points, core and
IndexedDB. Three imported inconsistencies are rejected by both preview and
portable builders without changing storage or grants. Each can be repaired by
the canonical editor. Restoring each original inconsistent snapshot again
refuses both builds: twelve build refusals total. Valid canonical and ordinary
captures pass. The existing browser source identity, race, dependency, deletion
and tampered-basis regressions pass, with no page exceptions.

This is exact projection consistency for the existing finite decision profile,
not compiler preservation or whole-app semantic closure. Local shell provenance
is diagnostic. Exact-head immutable SDK and Studio acceptance remain required.
