# Home card keyboard boundary

This repairs the existing `FoundryExperience.homeIsAWorkspace` behavior: the
card opens its app or idea, while its Bookmark button keeps the card in this
browser. It adds no capability, model statement, kernel input, layout, style,
or network operation. The production change is one early return in the existing
`Card.onKeyDown`: descendant events do not activate the card.

## Regression and controls

At PR #164 head `6a1202afc817608c4552cf6d335bfbd6413f561d`, Bookmark's
Enter and Space events bubbled to the containing card. The card opened the app
and prevented the button's default keyboard activation, despite the button's
click handler already stopping click propagation.

`node --test studio/tools/home_card_keyboard.test.mjs` loads the production
screen through the same `screenSource` selector used by Vite, compiles its
unchanged Card and Keep functions with the locked TypeScript package, and
renders them with real React in locked happy-dom. It does not copy the handler
under test. Router, unused showcase hooks, and the decorative icon are isolated.

Before the repair, the six-control suite exited 1: both nested Bookmark cases
failed with `the card cancelled the Bookmark key default` (`true !== false`).
With the guard, all six pass. Enter and Space on the focused card each open
exactly once; descendant keys remain uncancelled and do not open it; the actual
Bookmark click handler toggles repeatedly without opening; unrelated keys are
left alone. Happy-dom does not synthesize a native keyboard click, so that
separate fact is not claimed by these component tests.

The following planted defects were each rejected with exit 1 on 2026-11-13:

| Planted defect | Rejecting control |
| --- | --- |
| Remove the target/currentTarget guard | Both nested Bookmark key cases |
| Return unconditionally from Card's key handler | Both focused Card key cases |
| Remove Keep's click stopPropagation | Both nested Bookmark click cases |
| Omit the mandatory browser command | Mandatory integration control |
| Filter the mandatory component command | Mandatory integration control |
| Allow the component step to fail without failing CI | Mandatory integration control |
| Skip a component test case | Top-level AST self-check |

Running the component gate itself with `--test-name-pattern=focused` is also
rejected before any test runs: `keyboard acceptance must not be filtered`.

Restored, the focused suite plus `studio/tools/shell_ui.test.mjs` pass 13/13,
with zero skipped, cancelled, or pending tests. The tests also check their own
files for skipped/only/pending tests and require unfiltered workflow commands,
the established prerequisites, and failing CI status for a failing command.

## Mandatory browser coverage

`node studio/tools/home_card_keyboard_browser.mjs` is added to the existing
mandatory browser acceptance block in `.github/workflows/studio.yml`; every
failure still sets the block's failing status. The component suite is a
separate mandatory step using the same successful-shell/corpus prerequisites
as the existing surface tests. No existing gate is removed or weakened.

The browser journey requires the built production shell and locked Playwright.
It focuses the real card and Bookmark button and sends actual Enter and Space
keys. It checks exact idea-open counts, unchanged prompt and URL during
bookmarking, repeated native toggles, local storage, persistence after reload,
removal from the Bookmarked view, and no popups or page exceptions. It waits for
the intended pressed state, including bookmark hydration after reload.

This browser journey has **not been executed successfully** in the repair
environment. Its attempted run exited 1 before launching Chromium with
`Build and project the actual shell first: core.wasm`. The locked SDK, Cargo,
Docker, and `just` are unavailable here. No fixture core or substitute SDK was
used, and `just vv` and full Studio acceptance are not claimed.

## Other local checks

- Exact locked renderer dependencies installed with `npm ci --ignore-scripts`.
- Production Vite shell build passed using `vite.shell.config.mts` and the
  `/foundry/` deployment base.
- New test files pass the locked formatter; all three JavaScript/TSX files pass
  focused locked lint with zero warnings and errors. The existing component
  fails the formatter on the untouched PR head too; its unrelated formatting
  is preserved to keep the production diff to one line.
- The browser gate parses with `node --check`.
- The generic vendored `npm run ts` is red on omitted upstream pro, worker, and
  test modules. It is not a full renderer qualification receipt.
- The projected renderer typecheck is red with TS7016 on the existing import
  of `../../hologram.featured-apps.mjs` in FeaturedAppShowcase: the module has no
  declaration. This repair does not suppress the diagnostic or weaken compiler
  options. Replaying with the exact unchanged PR-head component produces the
  identical single diagnostic and exit 1. A full typecheck pass is not claimed.

Before release or merge, run the production browser journey and the full
repository acceptance boundaries with the exact SDK selected by `prismpm.lock`.

## Combined workflow count

Combining the keyboard gate with the Home oracle repair exposed the existing
workflow aggregate's fixed 63-command expectation: the unchanged audit refused
the new 64-command browser group. Its expected count is now explicitly 64,
including the new keyboard journey; it is not derived from the observed script.
All failure-aggregation and verified-prerequisite checks remain unchanged. The
combined keyboard, surface, gallery, stylesheet and workflow suites pass all
24 controls with no failures, skipped, cancelled or todo tests.
