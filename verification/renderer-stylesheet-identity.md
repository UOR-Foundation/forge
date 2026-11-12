# FA-62 — Renderer stylesheet identity

Authority: `FoundrySpecification.rendererStylesheetBoundary`. Registration, scenario and the observed failing Rust test preceded implementation.

Vite identifies preloaded CSS by its deployment-prefixed href attribute. The projected page previously used a relative attribute, so entering the home route requested the same renderer CSS again before rendering. The entry now resolves the asset against the document base and assigns its pathname once, before module execution. Assigning a new URL to an already loaded stylesheet also causes a second request; the final projection starts with no href and assigns it exactly once. The host and renderer module order is unchanged.

Three focused controls cover root, nested and encoded deployment paths, the module boundary and mandatory browser acceptance. Actual Chromium loads the built renderer, observes exactly one stylesheet request through home and settings navigation, checks computed styles and reports no page exceptions. The service worker is blocked for this regression check so caching cannot hide duplicate requests. Offline and verified closure behavior remain covered by their existing mandatory journeys.

Cold-load performance remains subject to the unchanged signed guest budgets. Removing this duplicate request alone does not establish whole-application performance or release acceptance. Full current-revision acceptance and independent review remain required.

All 374 Node controls, the Rust workspace, Clippy and formatting pass. The restored browser gate passes after three rejected defects: relative stylesheet identity in the actual generated page, a wrong root deployment path, and removal of normalization in the projector. The two-module host diagnostic verifies at `0b31e2ce578223689120482b8fade9a6ee82f8bebf63c188b4a032dd164e5915`; this is not exact-SDK acceptance.

The complete local mobile run reports cold `[12428, 12284, 12448]` ms (median 12428, over 11500), warm `[1716, 1440, 1560]` ms (median 1560, within 2200), INP `[264, 256, 192]` ms (median 256, within 450) and first token `[4155, 3868, 3358]` ms (median 3868, within 5000). All seven static renderer route budgets pass. This change removes duplicate CSS retrieval; it does not clear the remaining cold-load regression.

The full 43-journey local browser sweep passes 42 journeys, including the new stylesheet gate. `private_provider_credentials_browser.mjs` fails after removing a malformed stored credential: an overlapping renderer settings update can resurrect the earlier value because its read and write occur in separate transactions. This finding remains open; the result is preserved in `renderer-stylesheet-browser-results.json` and the revision remains draft.
