# Durable generation themes — FA-67

Authority: `FoundrySpecification.themeLibraryBoundary`, `ThemeLibraryError`, and the `theme-library` entries in `CommandRegistry.commandRegistryJson`. Registration and the intentionally failing Rust gate preceded implementation at `084da5d`.

The imported renderer catalog is reproduced from its pinned `shared/themes.ts` with locked esbuild 0.25.9. `BUILTIN_THEMES_LOCK.json` binds source, package lock, generator, license and output bytes; the mandatory read-only projection check rejects drift. This imports catalog data, not a second local semantic authority.

Custom theme records and app selection share a settings/apps IndexedDB transaction. Completion alone acknowledges reads and writes; deletion clears all selecting apps in that transaction. Inputs are captured before database readiness, identities never recycle, Dates retain their imported shape, omitted fields survive updates, and journal corruption refuses. Generation resolves a detached prompt before provider consent and sends exactly the disclosed bytes even when the stored theme subsequently changes. Theme text grants no effects.

Local qualification:

- All 415 Node controls, Rust workspace, Clippy, formatting and browser-script parsing pass.
- Imported input/output contract checks and actual renderer boundary recovery pass.
- Six focused controls cover CRUD, Date/identity fidelity, corruption, limits, catalog provenance, typed errors and mandatory integration.
- The actual browser covers two-window concurrent IDs, reload, malformed/missing selections, corrupt storage, late-abort rollback, captured input, atomic multi-app deletion, manual renderer create/edit/delete, keyboard theme selection, and exact approved provider bytes after a pending theme edit. External inference is intercepted by the test; no paid provider request is made. Zero page exceptions.
- Diagnostic host LexLean verification: specification `e37125003bd58a6a6ffa2680f59b7ada7f0bb9c889d8d5b3937260636faed512`; command registry `9f16faa225319e19da085bc1e17d0b71e0d95192d3eeba4bc463e46e18467394`. These are diagnostics, not exact-SDK acceptance.

Eight representative planted defects were rejected, then source was restored: omitted update result; string creation Date; disabled journal ordering; changed imported catalog bytes; acknowledgement before transaction completion; omitted selection cleanup; uncaptured input; omitted theme in the generated request. The last four run the actual browser gate after rebuilding the host bundle. The early-ack variant incorrectly reports success after the injected abort; dangling selection refuses instead of returning null; uncaptured input returns the caller's later mutation; omitted generation bytes fail the real disclosure assertion. The full restored integration sweep and hosted exact-SDK qualification are recorded separately as they finish.

The renderer journey exposes an existing floating `Interactive apps` action overlapping the chat auxiliary-menu pointer target at the default viewport. This gate exercises real keyboard access; it does not establish unobstructed pointer access. A separate UI correction is required. Generation is tested with one remaining window after the independent two-window storage checks; this is not cross-window consent ownership qualification.

URL/image theme generation and theme-image storage remain separate unqualified capabilities. This feature does not close factory consumer adoption, production dependency qualification, independent review, or whole-application release obligations.

All 48 mandatory browser journeys pass together on the restored 586-file projected application; complete results are in `theme-library-browser-results.json`. Its closure is `c114a6cbc2cbabdce28def294fc301278d20f48169bc1fbcdd83492cce69ad7c` (51,337,272 bytes). This includes the original editor, permission, compiler, import, queue, recovery and privacy gates alongside the new theme journey.

The full three-run mobile performance gate passes without changed budgets: cold median 9540 ms / 11500, warm 1784 / 2200, INP 184 / 450 and first token 3537 / 5000. Exact arrays are retained in `theme-library-performance.json`; all seven route budgets pass.
