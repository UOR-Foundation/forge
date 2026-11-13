import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolveUi } from "../vendor/dyad/hologram.ui.mjs";
import { screenSource } from "../vendor/dyad/hologram.screens.mjs";
import { createRequire } from "node:module";
import { test as nodeTest, after } from "node:test";
let completedCases = 0;
function test(name, body) {
  return nodeTest(name, async (...args) => {
    try {
      await body(...args);
    } finally {
      completedCases++;
    }
  });
}
import { Window } from "../vendor/dyad/node_modules/happy-dom/lib/index.js";
import { modelSelectionScope } from "../vendor/dyad/hologram.model-selection.mjs";
import { chatModeCatalog } from "../vendor/dyad/hologram.chat-mode-data.mjs";
const require = createRequire(new URL("../vendor/dyad/package.json", import.meta.url));
const lock = require("./package-lock.json");
for (const name of ["typescript", "react", "react-dom", "happy-dom", "radix-ui"])
  assert.equal(
    require(`${name}/package.json`).version,
    lock.packages[`node_modules/${name}`].version,
  );
const window = new Window();
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "ShadowRoot",
  "CustomEvent",
  "NodeFilter",
  "HTMLInputElement",
  "MouseEvent",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
])
  globalThis[name] =
    name === "window"
      ? window
      : name === "getComputedStyle"
        ? window.getComputedStyle.bind(window)
        : window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const { act, createElement } = require("react"),
  { createRoot } = require("react-dom/client"),
  ts = require("typescript");
// These checks cannot be filtered into a vacuous green result.
assert.equal(
  process.execArgv.some((arg) => /^--test-(?:name-pattern|skip-pattern|only)(?:=|$)/.test(arg)),
  false,
);
for (const relative of [
  "./chat_mode_accessibility.test.mjs",
  "./browser_chat_mode_controls_browser.mjs",
]) {
  const source = ts.createSourceFile(
    relative,
    fs.readFileSync(new URL(relative, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const inspect = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["test", "it", "describe"].includes(node.expression.text)
    )
      assert.equal(["skip", "only", "todo"].includes(node.name.text), false);
    if (ts.isPropertyAssignment(node))
      assert.equal(["skip", "only", "todo"].includes(node.name.getText(source)), false);
    ts.forEachChild(node, inspect);
  };
  inspect(source);
}
let pathname = "/",
  selectedMode = "build",
  pending,
  fail = false,
  writes = [],
  chatLoading = false,
  mac = false;
const hooks = {
  "@/hooks/useChatMode": {
    useChatMode: () => ({
      chat: { id: 1 },
      selectedMode,
      isLoading: chatLoading,
      isUpdating: false,
      setChatMode: (mode) => save("chat", mode),
    }),
  },
  "@/hooks/useSettings": {
    useSettings: () => ({ settings: {}, updateSettings: (patch) => save("settings", patch) }),
  },
  "@/hooks/useChatModeToggle": { useIsMac: () => mac },
  "@tanstack/react-router": {
    useRouter: () => ({ options: { basepath: "/" } }),
    useRouterState: () => ({ location: { pathname, search: { id: 1 } } }),
  },
  "./hologram.model-selection.mjs": { modelSelectionScope },
  "./hologram.chat-mode-data.mjs": { chatModeCatalog },
};
async function save(target, value) {
  writes.push({ target, value: structuredClone(value) });
  if (pending) await pending;
  if (fail) throw Error("write failed");
}
const cache = new Map();
function compile(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const file = relative.startsWith("/")
      ? pathToFileURL(relative)
      : new URL("../vendor/dyad/" + relative, import.meta.url),
    source = screenSource(file.pathname, fs.readFileSync(file, "utf8"));
  const built = ts.transpileModule(source, {
    fileName: file.pathname,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(built.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(
    built.outputText,
    {
      module,
      exports: module.exports,
      window,
      require(name) {
        if (hooks[name]) return hooks[name];
        const projected = resolveUi(name, file.pathname);
        if (projected) return compile(projected);
        if (name === "@/lib/utils") return compile("src/lib/utils.ts");
        return require(name);
      },
    },
    { filename: file.pathname },
  );
  cache.set(relative, module.exports);
  return module.exports;
}
assert.match(
  fs.readFileSync(new URL("../vendor/dyad/vite.shell.config.mts", import.meta.url), "utf8"),
  /return modeSelector/,
);
const { ChatModeSelector } = compile("hologram.ChatModeSelector.tsx");
after(async () => {
  assert.equal(completedCases, 3, "mode accessibility cases must not be conditionally omitted");
  await window.happyDOM.close();
});
async function mounted(run) {
  pathname = "/";
  selectedMode = "build";
  pending = null;
  fail = false;
  writes = [];
  chatLoading = false;
  mac = false;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = () => act(async () => root.render(createElement(ChatModeSelector)));
  await render();
  try {
    await run({ container, render });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}
const trigger = () => document.querySelector('[data-slot="chat-mode-toggle"]');
async function click(node) {
  await act(async () => {
    if (node === trigger())
      node.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    else node.click();
  });
}
async function key(key, options = {}) {
  await act(async () =>
    window.dispatchEvent(
      new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
    ),
  );
}
test("projected selector exposes one named keyboard trigger and no duplicate select", async () =>
  mounted(async ({ container }) => {
    assert.equal(trigger().getAttribute("aria-hidden"), null);
    assert.equal(trigger().tabIndex, 0);
    assert.equal(trigger().getAttribute("aria-label"), "Chat mode: Build");
    assert.equal(trigger().getAttribute("aria-haspopup"), "menu");
    const mirror = container.querySelector("select");
    assert.equal(mirror.hidden, true);
    assert.equal(mirror.getAttribute("aria-hidden"), "true");
    assert.equal(mirror.tabIndex, -1);
    await click(trigger());
    const items = [...document.querySelectorAll('[role="menuitemradio"]')];
    assert.equal(items.length, 3);
    // The projected kit inserts an absolute indicator before our two-line label.
    // Verify the targeted layout class; Happy DOM does not prove rendered geometry.
    for (const item of items) {
      assert.ok(item.firstElementChild.classList.contains("absolute"));
      assert.ok(
        item.classList.contains("[&>span:first-child]:hidden"),
        "decorative indicator must not overlap the label",
      );
      assert.ok(item.children[1].classList.contains("flex-col"));
    }
    assert.deepEqual(
      items.map((x) => x.getAttribute("aria-label")),
      ["Build", "Chat", "Plan"],
    );
    assert.equal(items[0].getAttribute("aria-checked"), "true");
    assert.equal(document.querySelectorAll('[role="menu"]').length, 1);
  }));
test("menu saves once, disables while pending, reports failure and retains host mode", async () =>
  mounted(async () => {
    let release;
    pending = new Promise((resolve) => (release = resolve));
    fail = true;
    await click(trigger());
    await click(document.querySelector('[role="menuitemradio"][aria-label="Plan"]'));
    assert.equal(writes.length, 1);
    assert.equal(trigger().disabled, true);
    assert.equal(trigger().getAttribute("aria-busy"), "true");
    await key(".", { ctrlKey: true });
    assert.equal(writes.length, 1);
    await act(async () => release());
    assert.match(document.querySelector('[role="alert"]').textContent, /could not be saved/);
    assert.equal(trigger().disabled, false);
    assert.equal(trigger().getAttribute("aria-label"), "Chat mode: Build");
    assert.deepEqual(writes, [
      { target: "settings", value: { selectedChatMode: "plan", defaultChatMode: "plan" } },
    ]);
  }));
test("host chat ownership, loading and platform shortcuts remain authoritative", async () =>
  mounted(async ({ render }) => {
    pathname = "/chat";
    chatLoading = true;
    await render();
    assert.equal(trigger().disabled, true);
    await key(".", { ctrlKey: true });
    assert.equal(writes.length, 0);
    chatLoading = false;
    selectedMode = "ask";
    await render();
    assert.equal(trigger().getAttribute("aria-label"), "Chat mode: Chat");
    await key(".", { ctrlKey: true });
    assert.deepEqual(writes, [{ target: "chat", value: "plan" }]);
    mac = true;
    await render();
    await key(".", { ctrlKey: true });
    assert.equal(writes.length, 1);
    await key(".", { metaKey: true });
    assert.equal(writes.length, 2);
  }));
