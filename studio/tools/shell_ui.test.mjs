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
  for (const token of ["--popover", "--popover-foreground", "--muted-foreground", "--sidebar-foreground", "--sidebar-accent", "--font-sans", "--font-mono", "--ring"]) assert.ok(section.includes("var(" + token + ")"), token);
  assert.ok(section.includes("@media (pointer: coarse)") && section.includes("prefers-reduced-motion"));
});
