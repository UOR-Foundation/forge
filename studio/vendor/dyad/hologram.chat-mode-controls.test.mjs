import { CHAT_MODE_PATCHES } from "./hologram.chat-mode-patches.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  browserChatMode,
  assertBrowserChatModes,
  browserChatModeSettings,
} from "../../shell/browser-chat-modes.mjs";
import { chatModeCatalog } from "../../shell/chat-mode-catalog.mjs";
test("canonical catalog reproduces exactly and offers only implemented browser modes", () => {
  assert.deepEqual(chatModeCatalog.modes, [
    { id: "build", label: "Build" },
    { id: "ask", label: "Chat" },
    { id: "plan", label: "Plan" },
  ]);
  const r = spawnSync(
    "python3",
    [new URL("../../tools/chat_mode_catalog_projection.py", import.meta.url).pathname, "--check"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("explicit mode precedes captured default and absent preferences preserve Build", () => {
  for (const mode of ["build", "ask", "plan"]) {
    assert.equal(browserChatMode(mode, { defaultChatMode: "ask" }), mode);
    assert.equal(browserChatMode(undefined, { defaultChatMode: mode }), mode);
    assert.doesNotThrow(() =>
      assertBrowserChatModes({ selectedChatMode: mode, defaultChatMode: mode }),
    );
  }
  assert.deepEqual(browserChatModeSettings({ selectedChatMode: "ask" }), {
    selectedChatMode: "ask",
    defaultChatMode: "ask",
  });
  assert.equal(
    browserChatModeSettings({ defaultChatMode: "local-agent" }).defaultChatMode,
    "local-agent",
  );
  assert.equal(browserChatMode(undefined, {}), "build");
  assert.equal(browserChatMode(undefined, { selectedChatMode: "plan" }), "plan");
  assert.equal(browserChatMode("ask", { defaultChatMode: "invalid" }), "ask");
});
test("unsupported malformed and null modes fail before writes", () => {
  for (const mode of ["local-agent", "agent", "", {}, [], 7, null]) {
    assert.throws(() => browserChatMode(mode, {}), { code: "invalidChatExecutionMode" });
    assert.throws(() => assertBrowserChatModes({ selectedChatMode: mode }), {
      code: "invalidChatExecutionMode",
    });
    assert.throws(() => assertBrowserChatModes({ defaultChatMode: mode }), {
      code: "invalidChatExecutionMode",
    });
  }
  assert.throws(() => browserChatMode(undefined, { defaultChatMode: "invalid" }), {
    code: "invalidChatExecutionMode",
  });
});
test("actual selector creation settings and mandatory browser bind to canonical ownership", () => {
  const read = (p) => fs.readFileSync(new URL("../../../" + p, import.meta.url), "utf8"),
    host = read("studio/shell/host.js"),
    picker = read("studio/vendor/dyad/hologram.ChatModeSelector.tsx");
  assert.ok(!host.includes("...BUILD_MODE"));
  assert.ok(host.includes("assertBrowserChatModes(patch)"));
  assert.ok(host.includes("browserChatMode(initialChatMode,"));
  assert.ok(host.includes("browserChatMode(undefined,"));
  assert.ok(host.includes("initialChatMode: capturedMode"));
  assert.ok(read("studio/shell/project-creation.mjs").includes("chatMode: capturedMode"));
  assert.ok(read("studio/vendor/dyad/hologram.screens.mjs").includes("...CHAT_MODE_PATCHES,"));
  for (const x of [
    "chatModeCatalog.modes",
    "modelSelectionScope(",
    "setChatMode(",
    "defaultChatMode: mode",
    "disabled={",
  ])
    assert.ok(picker.includes(x), x);
  for (const patch of CHAT_MODE_PATCHES) {
    const original = read("studio/vendor/dyad/" + patch.file);
    assert.equal(original.split(patch.from).length, 2);
    assert.ok(!original.replace(patch.from, patch.to).includes("useChatModeToggle();"));
  }
  assert.equal(CHAT_MODE_PATCHES.length, 2);
  assert.deepEqual(CHAT_MODE_PATCHES.map((p) => p.file).sort(), [
    "src/components/chat/ChatInput.tsx",
    "src/components/chat/HomeChatInput.tsx",
  ]);
  assert.ok(
    !read("studio/vendor/dyad/vite.shell.config.mts").includes(
      'out.replace("<ChatModeSelector />", "{null}")',
    ),
  );
  assert.ok(
    read("app/src/FoundrySpecification.lex.tex").includes("name: browserChatModeControlsBoundary,"),
  );
  assert.ok(
    read(".github/workflows/studio.yml").includes(
      "node tools/browser_chat_mode_controls_browser.mjs",
    ),
  );
  assert.ok(read("studio/tools/shell_parse.mjs").includes("browser-chat-modes.mjs"));
  // The SDK-native suite has no renderer npm prerequisite. Its four pure controls stay complete;
  // compiled renderer controls are independently mandatory in Studio, after its locked npm install.
  const workflow = read(".github/workflows/studio.yml");
  const accessibility = read("studio/tools/chat_mode_accessibility.test.mjs");
  const assertProjectedGate = (workflow, fixture) => {
    const lane = workflow.match(/\n  lane:\n([\s\S]*?)    steps:/)?.[1];
    assert.ok(lane, "Studio lane must remain present");
    assert.equal(
      /^    (?:if|continue-on-error):/m.test(lane),
      false,
      "Studio cannot skip or ignore the renderer lane",
    );
    const steps = workflow
      .split(/^      - /m)
      .filter((step) => step.includes("run: node --test tools/chat_mode_accessibility.test.mjs"));
    assert.equal(steps.length, 1, "one mandatory projected accessibility command");
    const step = steps[0];
    assert.match(step, /\n        run: node --test tools\/chat_mode_accessibility\.test\.mjs\s*$/);
    assert.ok(
      step.includes(
        "if: ${{ !cancelled() && steps.shell_closure.conclusion == 'success' && steps.corpus.conclusion == 'success' }}",
      ),
    );
    assert.equal(step.includes("continue-on-error"), false);
    assert.ok(
      workflow.includes("run: npm ci --prefix vendor/dyad --ignore-scripts --no-audit --no-fund"),
    );
    assert.equal(/\b(?:test|nodeTest)\.(?:skip|only|todo)\s*\(/.test(fixture), false);
    assert.equal(
      (fixture.match(/^test\("/gm) ?? []).length,
      3,
      "all three projected cases must remain",
    );
    assert.ok(fixture.includes("assert.equal(completedCases, 3,"));
    assert.ok(fixture.includes("completedCases++"));
    assert.ok(fixture.includes("resolveUi(name, file.pathname)"));
    assert.ok(fixture.includes('screenSource(file.pathname, fs.readFileSync(file, "utf8"))'));
    assert.ok(fixture.includes('compile("hologram.ChatModeSelector.tsx")'));
  };
  assertProjectedGate(workflow, accessibility);
  for (const broken of [
    workflow.replace("  lane:\n", "  lane:\n    if: false\n"),
    workflow.replace(
      "run: node --test tools/chat_mode_accessibility.test.mjs",
      "run: node --test tools/shell_ui.test.mjs",
    ),
    workflow.replace(
      "run: node --test tools/chat_mode_accessibility.test.mjs",
      "run: node --test --test-name-pattern=projected tools/chat_mode_accessibility.test.mjs",
    ),
    workflow.replace(
      "run: node --test tools/chat_mode_accessibility.test.mjs",
      "continue-on-error: true\n        run: node --test tools/chat_mode_accessibility.test.mjs",
    ),
    workflow.replaceAll(
      "if: ${{ !cancelled() && steps.shell_closure.conclusion == 'success' && steps.corpus.conclusion == 'success' }}",
      "if: false",
    ),
  ])
    assert.throws(() => assertProjectedGate(broken, accessibility), { name: "AssertionError" });
  for (const broken of [
    accessibility.replace('test("projected selector', 'test.skip("projected selector'),
    accessibility.replace("assert.equal(completedCases, 3,", "assert.equal(completedCases, 2,"),
    accessibility.replace("resolveUi(name, file.pathname)", "null"),
    accessibility.replace(
      'compile("hologram.ChatModeSelector.tsx")',
      'compile("src/components/ChatModeSelector.tsx")',
    ),
  ])
    assert.throws(() => assertProjectedGate(workflow, broken), { name: "AssertionError" });
});
