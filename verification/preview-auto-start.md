# State-aware automatic preview startup — FA-82

Authority: `FoundrySpecification.previewAutoStartBoundary`. Registration and failing conformance precede implementation at `019dfa07a490fb1f6b046bdfcf651980581c6106`.

A fresh diagnostic against the actual preceding renderer showed that declining preview permission did not survive responsive panel remounts: another dialog intercepted the mode control. Ask submission itself succeeded in that diagnostic, so this feature does not claim to explain every earlier submission timeout.

The owned renderer patch reads the imported app-run snapshot. Automatic startup requires matching positive safe identity and the initial idle state, with no operation, start timestamp or settlement. Other states remain under the existing explicit controls. The effect depends on the derived eligibility boolean, not snapshot object identity. An initial implementation used the snapshot object as a dependency and produced a notification loop; that failed diagnostic was stopped, retained and corrected before qualification. Full navigation creates a new document-owned run session and may ask again; denial is not persisted across windows or reloads.

Four controls cover initial identity, noninitial states, exact imported-source patch ownership and mandatory model/renderer/browser binding. Eight unit mutations are rejected: unsafe identity, foreign identity, active-state retry, active operation, prior start, prior settlement, snapshot-object effect dependency and wrong source file. A rebuilt-renderer mutation admitting an errored state fails the exact browser assertion `decline must not authorize another automatic preview` (two prompts instead of one).

The actual Chromium journey verifies initial permission, decline, repeated 390/768/1280 remounts, unobstructed Ask submission and one explicitly approved cloud request, explicit toolbar retry, and a fresh permission flow after full reload. No page exceptions occur. The corrected focused journey and the final restored-renderer replay both pass. Full integrated qualification is in progress.

All 479 Node controls pass again after final mutation restoration. Renderer build and locked lint pass; the initial renderer typecheck reports 28 upstream errors and zero added errors, with the final boolean-dependency revision to be rechecked. Diagnostic host LexLean verifies two modules with attestation `35c9026ea3cfad18df0ae1fb7950c8d0101572a71d3e4d408df0d1796abc18ba`. Immutable SDK acceptance, broader product coverage and independent approval are separate obligations.
