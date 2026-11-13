// Foundry's own surfaces take the app's look from one place (shell/appearance.css): the approval dialogs,
// the notices while a request is open, and the tools in the sidebar. Each is built by the shell with an inline
// style of its own; these claims hold that the stylesheet still covers every one of them, from brand tokens.
//
//   node --test tools/shell_ui.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../shell/appearance.css");
const section = css.slice(css.indexOf("/* Foundry's own surfaces"));

test("every dialog the shell opens is a native dialog, which the one rule styles", () => {
  assert.ok(section.includes("dialog:not([data-slot]) {"), "the dialog rule is gone");
  for (const file of ["inference-consent.mjs", "preview-permissions.mjs", "hosted-source-permission.mjs", "github-publication-permission.mjs", "portable-build-permission.mjs", "discovery-ui.mjs", "interaction-ui.mjs"]) {
    const source = read("../shell/" + file);
    assert.match(source, /(element|el)\((document, ?)?['"]dialog['"]/, file + " no longer builds a native dialog: its surface is unstyled");
    assert.equal(/data-slot/.test(source), false, file + " sets data-slot, which takes it out of the rule");
  }
});

test("the approvals are told apart from other dialogs by their label, and their approval is the last button", () => {
  assert.ok(section.includes('dialog:not([data-slot])[aria-label^="Review"] button:last-of-type'));
  for (const [file, label, allow] of [["inference-consent.mjs", "Review cloud request", "Send this request"], ["preview-permissions.mjs", "Review preview permissions", "Allow this preview"], ["hosted-source-permission.mjs", "Review hosted source transfer", "Allow this turn"]]) {
    const source = read("../shell/" + file);
    assert.ok(source.includes(label), file + " lost its label");
    const deny = source.search(/Don't (send|allow)/), ok = source.lastIndexOf(allow);
    assert.ok(deny > 0 && ok > deny, file + ": the refusal is built before the approval, so the approval is last");
    assert.ok(/deny\.autofocus ?= ?true/.test(source), file + ": focus still starts on the refusal");
  }
});

test("open requests and the sidebar tools are covered, by the ids and labels the shell gives them", () => {
  assert.ok(section.includes('aside[aria-label^="Active"]'));
  for (const file of ["inference-consent.mjs", "hosted-source-permission.mjs"]) assert.match(read("../shell/" + file), /setAttribute\(['"]aria-label['"], ?['"]Active /);
  assert.ok(section.includes("#foundry-shell-actions > button"));
  assert.ok(read("../shell/shell-action-dock.mjs").includes("dock.id='foundry-shell-actions'"));
  for (const id of ["foundry-preview-permissions", "foundry-interaction-applications", "foundry-application-discovery"]) assert.ok(section.includes("#" + id + "::before"), id + " has no mark");
});

test("the look comes from the brand's tokens: no colour of its own, in any theme", () => {
  const withoutMarks = section.replace(/url\("data:image\/svg\+xml[^"]*"\)/g, "");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(withoutMarks.replace(/#foundry-[a-z-]+/g, "")), false, "a literal colour is written in the section");
  for (const token of ["--popover", "--popover-foreground", "--muted-foreground", "--card", "--card-foreground", "--font-sans", "--font-mono", "--ring"]) assert.ok(section.includes("var(" + token + ")"), token);
  assert.ok(section.includes("@media (pointer: coarse)") && section.includes("prefers-reduced-motion"));
});

test("studio/experience: centred popups, golden measures, tools on Settings, a quiet Home", () => {
  // The preferences are a LexLean module of their own, outside the kernel's proof inputs.
  const spec = read("../experience/src/FoundryExperience.lex.tex");
  for (const name of ["oneLook", "popupsCentred", "goldenRatio", "questionAsNotification", "whyHowWhat", "sidebarIsNavigation", "toolsOnSettings", "homeAsksOneThing", "homeIsAWorkspace", "featuredCovers", "modelMenu"]) assert.ok(spec.includes("name: " + name + ","), name);
  assert.equal(read("../../app/src/FoundrySpecification.lex.tex").includes("foundrySurfaceExperienceBoundary"), false, "a look-and-feel preference is back in the kernel's specification");
  for (const input of fs.readdirSync(new URL("../../app/src/", import.meta.url)).filter((n) => n.endsWith(".lex.tex"))) assert.equal(read("../../app/src/" + input).includes("FoundryExperience"), false, input + " reads the look-and-feel module, which makes it a kernel proof input");
  assert.ok(read("../../.github/workflows/studio.yml").includes("key: experience-check-v1-${{ hashFiles('studio/experience/**', 'prismpm.lock') }}"));
  for (const said of ["centred on the screen", "golden ratio, 1.618", "why, then how, then what", "plain words without technical jargon", "first card of the Settings page", "233 pixels wide", "the question alone, with no line under it", "the hero fills the first screen at every size", "one short scroll brings the whole row", "a tile in the brand's light carrying its initial", "golden section of the room above the floor", "rises from the bottom edge", "no app picker and no mode selector", "in one column at the right"]) assert.ok(spec.includes(said), said);
  // centred, across and down
  assert.match(section, /dialog:not\(\[data-slot\]\) \{\s*box-sizing: border-box !important; inset: 0 !important; margin: auto !important; height: fit-content !important;/);
  // 550 = 340 x phi wide, at most 61.8% tall; the card's spaces, tile, title, text and controls are on the series
  for (const measure of ['550px', 'max-height: 61.8vh', 'padding: 21px', 'border-radius: 13px', 'gap: 13px 8px', 'width: 34px; height: 34px', 'font: 600 16px/1.3', 'font: 400 13px/1.618', 'min-height: 34px', 'min-height: 44px']) assert.ok(section.includes(measure), measure);
  // the tools are a card of Settings, first in its column; the sidebar is 233 px; Home shows no app picker
  assert.ok(read('../shell/shell-action-dock.mjs').includes("document.querySelectorAll('div:has(> #general-settings)')"));
  assert.match(css, /#foundry-shell-actions { order: -1; }/);
  assert.ok(css.includes('[data-slot="sidebar-wrapper"] { --sidebar-width: 233px !important; }'));
  assert.ok(css.includes('[data-testid="home-chat-input-container"] [data-testid="home-app-selector"] { display: none !important; }'));
  assert.ok(css.includes('#setting-default-chat-mode { display: none !important; }'));
  assert.ok(css.includes('p:has(> [data-slot="home-wide"]) { display: none !important; }'), 'the line under the home question is shown');
  // Home is a workspace: the floor sits last, the hero takes the room above it and the ideas are one line.
  assert.match(css, /\[data-slot="home-stage"\] \{\s*flex: 0 0 auto; min-height: calc\(100% - 89px\);/, "the hero no longer fills the first screen with the floor peeking under it");
  assert.ok(css.includes("min-height: calc(100% - 55px)"), "the phone's peek is gone");
  assert.ok(css.includes("padding-bottom: 76px"), "the floor no longer clears the phone's tab bar");
  // A card without a cover is still a card: the tile and its initial are drawn, and a real cover fills it.
  assert.match(css, /\[data-slot="home-featured"\] \[role="region"\] button > div:first-child > div \{\s*background: linear-gradient/);
  assert.ok(css.includes('[data-slot="home-featured"] [role="region"] button img { object-fit: cover !important;'));
  assert.ok(css.includes("max-height: 233px"), "the room under the hero is not capped on a tall window");
  assert.ok(css.includes("flex-wrap: nowrap !important"), "the ideas still wrap into a block");
  // The floor itself is never hidden (a rule inside it may hide a part of a card, which is not the floor).
  assert.equal(/\[data-slot="home-featured"\]\s*\{[^}]*display:\s*none/.test(css), false, "the floor is hidden at some size");
  assert.ok(css.includes("min-width: 768px") && css.includes("max-width: 767px"), "the home rules answer only one width");
  const mode = read('../vendor/dyad/hologram.ChatModeSelector.tsx');
  assert.ok(mode.includes('tabIndex={-1}') && mode.includes('pointer-events-none absolute left-0 top-0 h-px w-px opacity-0'));
});

test("each approval explains why, then how, then what, in plain words, and still states what must be disclosed", () => {
  const consent = read("../shell/inference-consent.mjs"), preview = read("../shell/preview-permissions.mjs"), hosted = read("../shell/hosted-source-permission.mjs");
  // why comes first in each
  for (const [source, why, what] of [[consent, "runs outside this browser, so your request has to be sent", "You are approving this one request"], [preview, "The preview runs your app's code", "You are approving this one version"], [hosted, "by a UOR service outside this browser", "You are approving"]]) {
    assert.ok(source.indexOf(why) > 0 && source.indexOf(what) > source.indexOf(why), why);
  }
  // the facts the approval boundaries require
  for (const fact of ["disclosure.model", "disclosure.provider", "disclosure.endpoint", "disclosure.credentialOwner", "automatic retries", "disclosure.bytes", "cannot be taken back"]) assert.ok(consent.includes(fact), fact);
  for (const fact of ["disclosure.source", "disclosure.endpoints", "IP address", "Preview permissions", "cannot take back"]) assert.ok(preview.includes(fact), fact);
  for (const fact of ["disclosure.endpoint", "disclosure.appId", "disclosure.turnId", "disclosure.source", "five minutes", "no cookies", "no proof and no publishing", "cannot be taken back"]) assert.ok(hosted.includes(fact), fact);
  // no jargon left in the words a person reads
  for (const source of [consent, preview, hosted]) for (const word of ["UTF-8", "module prefixes", "Credential:", "bounded retries", "aborts", "executes generated code"]) assert.equal(source.includes(word), false, word);
});

test("every phrase a browser gate reads from an approval is a phrase the approval still writes", () => {
  const dialogs = ["inference-consent.mjs", "hosted-source-permission.mjs", "preview-permissions.mjs"].map((s) => read("../shell/" + s));
  let found = 0;
  for (const gate of ["inference_consent_browser.mjs", "site_relay_authorization_browser.mjs", "hosted_source_permission_browser.mjs", "preview_permissions_browser.mjs", "sidebar_tool_access_browser.mjs"]) {
    for (const m of read("./" + gate).matchAll(/assert\.ok\(\(await dialog\.textContent\(\)\)\.includes\((['"])((?:(?!\1).)+)\1\)/g)) {
      const phrase = m[2];
      // Values a gate passes in itself (a key that must not appear, its own source, an address) are not wording.
      if (/secret|private app source|^https?:/.test(phrase)) continue;
      found++;
      assert.ok(dialogs.some((source) => source.includes(phrase)), gate + " reads a phrase no approval writes: " + phrase);
    }
  }
  assert.ok(found >= 4, "the gates' phrase checks were not found: " + found);
});
