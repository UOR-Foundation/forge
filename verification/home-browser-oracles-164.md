# Home browser oracle alignment, PR #164

Scope: the two stale acceptance oracles reported in Studio run
[43432092553, job 131907840512](https://github.com/UOR-Foundation/foundry/actions/runs/43432092553/job/131907840512).
Reviewed source and remote branch: `home-hero` at
`6a1202afc817608c4552cf6d335bfbd6413f561d`, rechecked on 2026-11-13.
This is test-only alignment, not a new product claim or release qualification.
Production, model, kernel, renderer, stylesheet, dependency, and workflow bytes
are unchanged by this patch.

## Gallery: distinct image and card evidence

`FeaturedAppShowcase.tsx` defaults to Featured on every mount. The browser gate
now explicitly selects **My apps** after each inspected navigation/reload and
scopes its tile locator to the Home showcase. It decodes the actual generated
20-pixel-wide image before editing source, then observes the image disappear.
The same image must remain absent after reload and forged legacy-cache input.

Home intentionally has no description. The current production Apps route is
`hologram.screens/AppsPage.tsx`, selected by `hologram.screens.mjs`; its Apps tab
renders a table. Although `CollectionDetailView` still renders the full
`AppShowcaseCard`, all `appCollections:*` commands are explicitly unavailable
in `shell/command-registry-data.mjs`. There is therefore no supported route to
that visible description at this head. The [PR body](https://github.com/UOR-Foundation/foundry/pull/164)
says the blurb stays on the Apps page; source inspection does not support that
claim. This remains a separate product/acceptance gap, not something this patch
fixes or claims to have visually tested.

Card assurance is explicit: exact description and tag are read through the
real read-only `window.__gallery` renderer adapter, survive reload, become null
after a source edit, stay null despite a forged unbound legacy card, and survive
republishing/reload without reviving a stale picture. Browser output reports
`rendererCardAdapterFreshness: true` and `visibleDescriptionChecked: false`.
Adapter checks do not substitute for visual description coverage.

All existing two-window atomic field merge, late transaction-abort rollback,
captured-input mutation, stale-source refusal, stale-field exclusion, legacy
cache, corruption, and deletion-without-resurrection checks remain in the
browser command. No IPC, host, storage, or renderer substitute is introduced.

## Stylesheet: exact responsive contract

The heading is governed by the existing production declaration
`clamp(34px, 4.2vw, 55px)` in `shell/appearance.css`. The obsolete constant 48px
assertion is replaced by exact computed-style checks on the actual Home heading:

| Viewport width | Expected font size | Purpose |
| --- | --- | --- |
| 390 | 34px | Phone minimum |
| 809 | 34px | Below lower clamp transition |
| 810 | 34.02px | Above lower clamp transition |
| 1280 | 53.76px | Existing desktop viewport |
| 1309 | 54.978px | Below upper clamp transition |
| 1310 | 55px | Above upper clamp transition |
| 1440 | 55px | Wide-screen maximum |

The browser returns to 1280px before Settings navigation. One renderer
stylesheet link, exactly one stylesheet request through Home and Settings,
service workers blocked, actual Settings navigation, Geist body font, and zero
page exceptions are still required. Each measured heading size is reported.

## Executed checks and planted defects

Node v24.22.1, 2026-11-13:

```
node --test --test-reporter=tap studio/tools/renderer_stylesheet_identity.test.mjs studio/tools/source_bound_gallery.test.mjs studio/tools/shell_ui.test.mjs
```

Restored result: **14 tests, 14 pass, 0 fail/cancelled/skipped/todo**. The
stylesheet and gallery suites still have exactly 3 and 4 tests respectively,
preserving their existing Rust report guards. All four modified `.mjs` files
pass `node --check`; `git diff --check` passes.

The focused tests inspect the mandatory browser commands and execute their
actual selection/adapter helpers or responsive assertion block with controlled
inputs. These are oracle tests, not a Chromium run. Seven wrong-size controls
individually return 48px at each listed width and must be rejected by the
browser assertion itself. Harness report comparisons cannot satisfy those
negative controls.

Each following planted source change was rejected with exit 1 and exactly one
failed test, then restored. Gallery plants use
`node --test --test-reporter=tap studio/tools/source_bound_gallery.test.mjs`;
stylesheet plants use
`node --test --test-reporter=tap studio/tools/renderer_stylesheet_identity.test.mjs`.

| Planted defect | Observed diagnostic |
| --- | --- |
| Select Featured instead of My apps | `'Featured'` differs from `'My apps'` |
| Omit view-selection click | Expected event sequence lacks `mine` |
| Resolve the tile from the page instead of the Home floor | Tile ID differs from expected `featured-app-showcase` |
| Omit My apps selection on reload | `every renderer reload must reselect My apps`, 1 differs from 2 |
| Bypass the renderer adapter for the gallery module | Missing `readGallery` on the unsupported test boundary |
| Omit a fresh description/tag assertion | `fresh description and tag must survive renderer reload and legacy cache`, 2 differs from 3 |
| Omit a stale-card null assertion | `source edits and legacy cache must not revive card text`, 1 differs from 2 |
| Restore 48px at width 1280 | `Home heading at 1280px must follow clamp(34px, 4.2vw, 55px)`, 53.76px differs from 48px |
| Omit width 1309 | `no width or clamp transition may be omitted` |
| Omit the browser font-size assertion | `Missing expected rejection: the oracle must reject a wrong size at 390px` |
| Omit the Settings stylesheet request assertion | `both Home and Settings must refuse duplicate stylesheet loads`, 1 differs from 2 |

The assertion-omission plant initially exposed a weakness in the new test
harness: its own report comparison could satisfy an expected rejection. The
harness was corrected to require the extracted browser assertion to reject;
all 11 plants then failed as intended, and the restored 14-test run passed.

## Not executed or qualified here

Neither browser command was executed locally. This checkout lacks the required
projected `core.wasm`, `assets/index.js`, `manifest.json`, `sw.js`, and
`provenance.json`. The environment also lacks Cargo, Docker, and Just. A known
Chromium process-socket restriction from the same work session was not retried.
No stand-in shell, alternate SDK, browser pass, screenshot, full Studio pass,
performance pass, or immutable-SDK acceptance is claimed.

The normative `just vv` remains required inside the immutable SDK selected by
`prismpm.lock`, alongside the normal full Studio/browser acceptance on the
combined final revision. This focused source result is not a lesser release
path. The existing mandatory workflow invocations are unchanged.
