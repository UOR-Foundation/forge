# Studio authoring projection evidence

FA-02 implements `FoundrySpecification.authoringBoundary` from
`app/src/FoundrySpecification.lex.tex`. The Python authoring declarations remain
the current Studio source boundary; this change checks their projections and
does not claim that Studio's behavioral authority has moved into Prism.

The registered capability and generated failing test preceded implementation.
`python3 studio/tools/author.py --check` now compares all five generated modules
and the export-root manifest as bytes without modifying any file. Failures use
the specification's `ProjectionError` constructors. Studio CI calls this mode.

The eight Python tests execute the actual adapter in isolated copies. They
cover current output, each missing and diverged output, unreadable output,
all failures together, newline-byte differences, source declaration changes,
and byte-identical regeneration. Snapshots check that validation writes nothing.
The Rust conformance test runs the Python suite and rejects skipped or incomplete
results; it participates in the existing complete acceptance command.

On 2026-11-11 a planted defect omitted the first output from the adapter's
comparison loop. `python3 -B studio/tools/test_author.py` rejected it with five
failures, including `AssertionError: 0 != 1` on drift, missing output, unreadable
output and newline drift. Restoring the loop restored passing behavior. The
full local Rust workspace suite passed 37 tests, including all eight Python
checks, and `just model-write` regenerated the conformance table.

An isolated diagnostic compiler verified all five application modules with
attestation `c94af1132d0687c59d3ddf816bf0bbec25869db4bf1b03825f407485407fff34`.
Its semantics digest differs from the locked SDK; this is diagnostic evidence,
not the required locked acceptance receipt. Local Docker storage could not
hold the selected SDK image. The unmodified remote `just vv` remains required.

## Completeness review

Author review checked the six outputs against the generation loop, independent
negative mutations, non-writing behavior, typed error names, byte comparisons,
and integration into Studio CI and the repository's conformance suite. No SDK,
lock, universal template file, generated behavior, or vendor code was replaced.
This is a self-review, not independent approval. The PR is draft pending complete
locked-SDK acceptance. Factory migration and Prism ownership of the Studio model
remain separate specification obligations and are not claimed by FA-02.
