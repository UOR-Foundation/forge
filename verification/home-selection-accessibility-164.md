# Home selection and mode accessibility, PR #164

Repair base: published commit `9bd321fece505ab3c0a0659d49422e917b84912c`,
tree `86ae2303d5a591c207a0202c5f11dcb459927b68`. This is a local repair of
existing Home and mode behavior, not a new capability or release qualification.

## Production behavior

Own apps are sorted using the renderer's existing favorite/recency order, then
filtered for the selected view and case-insensitive trimmed query, before the
four-card preview limit. Mixed saved previews retain featured catalogue order
first, followed by own-app showcase order. The preview does not promise that
every saved app is simultaneously visible. A search can find an older own app
outside the ordinary preview; creating an unrelated fifth app cannot turn a
single retained bookmark into a false empty collection. A query miss says
`Nothing matches that.` instead of claiming that no apps or bookmarks exist.

Only shown own-app IDs enter the unchanged source-bound thumbnail hook.
Featured and fallback covers remain local spectrum artwork; a checked own-app
thumbnail is shown when available. No new network operation, host command,
storage authority, or data scope is introduced.

The visible mode trigger is normally reachable with Tab and names the current
mode. Its actual projected shadcn/Radix radio menu exposes exactly Build, Chat
and Plan, checked state, and keyboard interaction. The old native select is a
hidden, inert inspection mirror, not a second accessibility control. Host
default/chat ownership, pending/loading disablement, typed failure wording,
and platform shortcuts remain in place. The kit's decorative radio indicator
is hidden so it does not overlap the existing two-line label/padding.

`FoundryExperience.lex.tex` reconciles the old no-mode, fixed-width/one-row,
universal-three-chip, and initial-letter-cover wording with those intended
surfaces. It keeps the standalone module and all unrelated preferences.
Cards share four columns at 1024px and above, two below; the two idea chips
are visible at 768px and above, while Surprise me remains on phones. CSS
declarations are unchanged: only stale explanatory comments changed. Nothing
in `app/`, kernel proof inputs, visual3D, generated locks, `CONFORMANCE.md`,
SDK selection, or universal policy is edited. These LexLean statements are
not proofs of appearance or usability.

## Red, green, and representative defects

The Home component test was extended before its implementation. At the base,
it failed on saved selection after a fifth app, unrelated thumbnail requests,
false empty-search wording, and an unbounded mixed saved preview. It loads the
actual Vite `screenSource` output, compiles the full component and real sorting
with locked TypeScript, and runs real React and localStorage in Happy DOM.
Host/query hooks alone are isolated. It covers view toggles, remounts, saved
removal, deterministic favorite/recency order, checked/fallback covers, and
exact visible thumbnail IDs. Happy DOM input handlers and clicks do not prove
native browser input or keyboard activation.

The mode fixture resolves imports using production `resolveUi` and
`screenSource`, including the actual vendored shadcn/Radix primitives. The
earlier raw Base UI harness was discarded before qualification. Trigger Enter
is dispatched to the actual primitive; only host hooks are isolated.

The following representative defects are rejected by the intended gate:

| Defect | Rejecting command/control |
| --- | --- |
| Truncate own apps before saved/search filtering | `home_card_keyboard.test.mjs`, saved-rank control |
| Request thumbnails for unrelated preview IDs | Same suite, full-collection search/thumbnail control |
| Use empty-collection text for a query miss | Same suite, actual rendered empty-state control |
| Hide/remove Tab access from mode trigger | `chat_mode_accessibility.test.mjs`, projected trigger control |
| Expose the native select mirror | Same suite, duplicate-control control |
| Route a chat mode write into settings | Same suite, host ownership control |
| Enable mode trigger during pending save | Same suite, pending-write control |
| Leave the decorative radio indicator over the label | Same suite, projected layout-structure control |
| Conditionally omit a Home or mode test | Exact executed-case after-hooks, 11 and 3 respectively |
| Omit/wrong-file/filter/fail-open the projected Studio step | Native pure mode and Home mandatory-path controls |
| Ignore/miscount/change the native wrapper's test target | Home mandatory-path control |
| Omit the browser's old-app query | Home mandatory-path control |
| Omit the browser's responsive column assertion | Exact browser-oracle execution in stylesheet suite |
| Restore contradictory mode/cover/fixed-width model prose | `shell_ui.test.mjs` |

Source plants each exited 1 before restoration. Behavioral mutation cases
compile and execute the changed component, not just search for its source
spelling. Responsive oracle controls execute the actual browser assertion
block with correct and incorrect computed-style inputs at 390, 767, 768, 1023,
1024 and 1280 pixels. These are oracle controls, not a rendered layout pass.

## Mandatory acceptance boundaries

The native FA80 Rust wrapper remains unchanged and requires its original
complete four pure Node controls, including zero failures, skips, cancellations
and todo cases. Those controls passed with the renderer `node_modules` link
removed. They verify the mandatory projected Studio path; they do not claim
that native `just vv` executes React without its dependencies.

Studio already performs `npm ci` from the unchanged renderer lock. The added
exact three-case projected mode command is mandatory after successful
shell-closure and corpus checks, with no filter or continue-on-error. Existing
projected typecheck and declaration controls remain mandatory. Home's existing
component command now has eleven cases and an executed-case count guard.

The existing 64-command browser aggregate remains 64 and retains failure
aggregation and prerequisite handling. Its existing journeys are extended:

- Gallery: four host-created apps, save oldest, add a fifth, reload, full-list
  search, actual checked image decoding, view toggles, native repeated saved
  toggles/removal, empty-search wording, and removal persistence.
- Mode: normal Tab discovery, Enter/Space opening, arrow selection, checked
  radio choices, Escape/focus return, pending disablement, late storage failure,
  default/chat persistence, shortcuts and responsive control fit.
- Preview: use the actual named mode button instead of the removed combobox;
  existing decline/remount/retry assertions are preserved.
- Stylesheet: retain heading clamp checks and verify actual responsive grid
  columns, equal card widths and chip visibility at both layout breakpoints.

## Local verification and remaining qualification

The combined focused Node suites pass 43/43 with zero failures, skipped,
cancelled or todo cases and exact locked renderer dependencies: workflow4,
Home11, stylesheet3, shell UI7, gallery4, declaration7, native mode4 and
projected mode3. The complete projected renderer typecheck reports no added
diagnostic over Dyad's existing 28 and every UI call rewritten (118.9 seconds).
The production Vite shell build passes (54.5 seconds), with its existing large
chunk advisory. Locked focused formatting and lint, browser script syntax,
and whitespace checks pass. No dependency lock was edited.

No browser journey was launched for this repair: the environment lacks the
projected core and has the previously established Chromium socket restriction.
No stand-in core, SDK, host, or screenshot is supplied. Cargo, Docker, and Just
are unavailable, so native Rust, `just model-write`, standalone exact-SDK
LexLean checks, and complete `just vv` were not run locally. The unchanged
immutable-SDK Experience check and full acceptance remain required in CI for
the final published revision. Earlier-head green CI is not qualification of
these new bytes.
