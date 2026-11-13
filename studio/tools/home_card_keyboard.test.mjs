import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { after, test as nodeTest } from "node:test";
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
import { screenSource } from "../vendor/dyad/hologram.screens.mjs";

const require = createRequire(new URL("../vendor/dyad/package.json", import.meta.url));
const ts = require("typescript");
const { parse: parseYaml } = require("yaml");
const { act, createElement } = require("react");
const lock = require("./package-lock.json");
for (const name of ["typescript", "react", "react-dom", "happy-dom", "yaml"]) {
  assert.equal(
    require(`${name}/package.json`).version,
    lock.packages[`node_modules/${name}`].version,
  );
}
assert.equal(
  process.execArgv.some((argument) =>
    /^--test-(?:name-pattern|skip-pattern|only)(?:=|$)/.test(argument),
  ),
  false,
  "keyboard acceptance must not be filtered",
);
for (const file of [
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL("./home_card_keyboard_browser.mjs", import.meta.url)),
  fileURLToPath(new URL("./source_bound_gallery_browser.mjs", import.meta.url)),
]) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const inspect = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["test", "describe", "it"].includes(node.expression.text)
    ) {
      assert.equal(
        ["skip", "only", "todo"].includes(node.name.text),
        false,
        `${path.basename(file)} suppresses test cases`,
      );
    }
    if (ts.isPropertyAssignment(node)) {
      assert.equal(
        ["skip", "only", "todo"].includes(node.name.getText(ast)),
        false,
        `${path.basename(file)} suppresses test cases`,
      );
    }
    ts.forEachChild(node, inspect);
  };
  inspect(ast);
}

// Load the same replacement the Vite renderer uses, then compile its unchanged Card and Keep.
// Only the unused showcase hooks/router and the decorative icon are isolated from this component test.
const upstream = fileURLToPath(
  new URL("../vendor/dyad/src/components/FeaturedAppShowcase.tsx", import.meta.url),
);
const source = screenSource(upstream, fs.readFileSync(upstream, "utf8"));
assert.equal(
  source,
  fs
    .readFileSync(
      new URL("../vendor/dyad/hologram.screens/FeaturedAppShowcase.tsx", import.meta.url),
      "utf8",
    )
    .replace(/\r\n/g, "\n"),
);
const compiled = ts.transpileModule(`${source}\nexport { Card, Keep };`, {
  fileName: upstream,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics, []);
const module = { exports: {} };
const unusedImports = new Set([
  "@tanstack/react-router",
  "@/hooks/useLoadApps",
  "@/hooks/useOpenApp",
  "@/hooks/useAppThumbnails",
  "@/lib/sortApps",
  "../../hologram.featured-apps.mjs",
]);
vm.runInNewContext(
  compiled.outputText,
  {
    module,
    exports: module.exports,
    require(name) {
      if (name === "react" || name === "react/jsx-runtime") return require(name);
      if (name === "lucide-react") return { Star: () => null };
      assert.ok(unusedImports.has(name), `unexpected component dependency: ${name}`);
      return {};
    },
  },
  { filename: upstream },
);
const { Card, Keep } = module.exports;

const window = new Window();
globalThis.window = window;
globalThis.document = window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require("react-dom/client");
after(async () => {
  assert.equal(completedCases, 11, "Home acceptance cases must not be conditionally omitted");
  await window.happyDOM.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

async function withCard(run) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let opens = 0,
    toggles = 0;
  await act(async () =>
    root.render(
      createElement(Card, {
        title: "Keyboard regression",
        under: "Test",
        cover: null,
        badge: null,
        onOpen: () => opens++,
        keep: createElement(Keep, {
          on: false,
          label: "Bookmark Keyboard regression",
          onClick: () => toggles++,
        }),
      }),
    ),
  );
  const card = container.querySelector('[role="button"]');
  const keep = container.querySelector('button[aria-label="Bookmark Keyboard regression"]');
  assert.ok(card && keep && card.contains(keep));
  try {
    await run({ card, keep, counts: () => ({ opens, toggles }) });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

async function keyDown(target, key) {
  const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => target.dispatchEvent(event));
  return event;
}

for (const key of ["Enter", " "]) {
  test(`focused card ${JSON.stringify(key)} opens once and prevents its default`, async () => {
    await withCard(async ({ card, counts }) => {
      card.focus();
      assert.equal(document.activeElement, card);
      assert.equal((await keyDown(card, key)).defaultPrevented, true);
      assert.deepEqual(counts(), { opens: 1, toggles: 0 });
    });
  });

  test(`nested Bookmark ${JSON.stringify(key)} leaves native activation uncancelled and never opens the card`, async () => {
    await withCard(async ({ keep, counts }) => {
      keep.focus();
      assert.equal(document.activeElement, keep);
      assert.equal(
        (await keyDown(keep, key)).defaultPrevented,
        false,
        "the card cancelled the Bookmark key default",
      );
      assert.deepEqual(counts(), { opens: 0, toggles: 0 });
      // Happy DOM does not synthesize a button's native keyboard click. Exercise its real click
      // handler here; the mandatory Chromium journey below proves that native default separately.
      await act(async () => keep.click());
      assert.deepEqual(counts(), { opens: 0, toggles: 1 });
      await act(async () => keep.click());
      assert.deepEqual(counts(), { opens: 0, toggles: 2 });
    });
  });
}

test("unrelated card keys do not activate or cancel the key", async () => {
  await withCard(async ({ card, counts }) => {
    for (const key of ["Tab", "Escape", "ArrowDown", "a"]) {
      assert.equal((await keyDown(card, key)).defaultPrevented, false);
      assert.deepEqual(counts(), { opens: 0, toggles: 0 });
    }
  });
});

test("both component controls and real renderer keyboard acceptance remain mandatory", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  const workflow = read("../../.github/workflows/studio.yml");
  assert.match(workflow, /^\s*run: node --test tools\/home_card_keyboard\.test\.mjs\s*$/m);
  assert.match(workflow, /^\s*run node tools\/home_card_keyboard_browser\.mjs\s*$/m);
  const lane = parseYaml(workflow).jobs.lane;
  assert.equal(lane.if, undefined);
  assert.equal(lane["continue-on-error"], undefined);
  const prerequisites =
    "${{ !cancelled() && steps.shell_closure.conclusion == 'success' && steps.corpus.conclusion == 'success' }}";
  for (const [filename, command] of [
    ["home_card_keyboard.test.mjs", "node --test tools/home_card_keyboard.test.mjs"],
    ["home_card_keyboard_browser.mjs", "run node tools/home_card_keyboard_browser.mjs"],
    ["source_bound_gallery_browser.mjs", "run node tools/source_bound_gallery_browser.mjs"],
  ]) {
    const steps = lane.steps.filter((step) => step.run?.includes(filename));
    assert.equal(steps.length, 1, `${filename} must have exactly one mandatory step`);
    const step = steps[0];
    assert.equal(step.if, prerequisites);
    assert.equal(step["continue-on-error"], undefined);
    if (filename.endsWith(".test.mjs")) assert.equal(step.run, command);
    else {
      assert.ok(step.run.split("\n").includes(command));
      assert.ok(step.run.includes('run() { "$@" || status=1; }'));
      assert.ok(step.run.trimEnd().endsWith('exit "$status"'));
    }
  }
  assert.ok(
    read("../experience/src/FoundryExperience.lex.tex").includes("name: homeIsAWorkspace,"),
  );
  const assertModeWiring = (workflowText, rust) => {
    const lane = parseYaml(workflowText).jobs.lane;
    assert.equal(lane.if, undefined);
    assert.equal(lane["continue-on-error"], undefined);
    const steps = lane.steps.filter((step) =>
      step.run?.includes("chat_mode_accessibility.test.mjs"),
    );
    assert.equal(steps.length, 1);
    assert.equal(steps[0].run, "node --test tools/chat_mode_accessibility.test.mjs");
    assert.equal(steps[0].if, prerequisites);
    assert.equal(steps[0]["continue-on-error"], undefined);
    assert.equal(/#\[ignore/.test(rust), false);
    assert.equal(/#\[cfg/.test(rust), false);
    assert.ok(rust.includes('.args(["--test", "--test-reporter=tap"])'));
    const files = [...rust.matchAll(/\.arg\(root\.join\("([^"]+)"\)\)/g)].map((match) => match[1]);
    assert.deepEqual(files, ["studio/tools/browser_chat_mode_controls.test.mjs"]);
    for (const required of [
      "# tests 4",
      "# pass 4",
      "# fail 0",
      "# cancelled 0",
      "# skipped 0",
      "# todo 0",
    ])
      assert.ok(rust.includes('"' + required + '"'));
    assert.ok(rust.includes("output.status.success()"));
    assert.ok(rust.includes("report.lines().any(|line| line == required)"));
  };
  const rust = read("../../crates/conformance/tests/browser_chat_mode_controls.rs");
  assertModeWiring(workflow, rust);
  for (const broken of [
    rust.replace(
      "studio/tools/browser_chat_mode_controls.test.mjs",
      "studio/tools/shell_ui.test.mjs",
    ),
    rust.replace('        .arg(root.join("studio/tools/browser_chat_mode_controls.test.mjs"))', ""),
    rust.replace("#[test]", "#[test]\n#[ignore]"),
    rust.replace("# tests 4", "# tests 7"),
    rust.replace("output.status.success()", "true"),
  ])
    assert.throws(() => assertModeWiring(workflow, broken), { name: "AssertionError" });
  for (const broken of [
    workflow.replace(
      "run: node --test tools/chat_mode_accessibility.test.mjs",
      "run: node --test tools/shell_ui.test.mjs",
    ),
    workflow.replace(
      "run: node --test tools/chat_mode_accessibility.test.mjs",
      "continue-on-error: true\n        run: node --test tools/chat_mode_accessibility.test.mjs",
    ),
    workflow.replaceAll(prerequisites, "false"),
  ])
    assert.throws(() => assertModeWiring(broken, rust), { name: "AssertionError" });
  const galleryBrowser = read("./source_bound_gallery_browser.mjs");
  for (const step of [
    "const savedId=await make('saved-older-home-app')",
    "await make('newer-home-5')",
    "await query.fill('  SAVED-OLDER-HOME-APP  ')",
    "await savedTile.waitFor({state:'hidden'})",
    "await savedKeep.press(key)",
    "await query.press('Escape')",
    "savedRemovalReload:true",
    "await page.reload();await floor.getByRole('button',{name:'Bookmarked',exact:true}).click()",
  ])
    assert.ok(galleryBrowser.includes(step), "saved/search browser scenario removed: " + step);

  const browser = read("./home_card_keyboard_browser.mjs");
  for (const required of [
    "await keep.press(key)",
    "await card.press(key)",
    "localStorage.getItem",
    "bookmarkOpens",
    "cardOpens",
  ]) {
    assert.ok(browser.includes(required), `real renderer keyboard control missing: ${required}`);
  }
  for (const file of [
    fileURLToPath(import.meta.url),
    fileURLToPath(new URL("./home_card_keyboard_browser.mjs", import.meta.url)),
    fileURLToPath(new URL("./source_bound_gallery_browser.mjs", import.meta.url)),
  ]) {
    const gate = fs.readFileSync(file, "utf8");
    assert.equal(
      /\b(?:test|describe|it)\.(?:skip|only)\s*\(/.test(gate),
      false,
      path.basename(file),
    );
  }
});

// The complete projected Home component, not a reconstructed selector. Hooks isolate storage/IPC;
// sorting, featured data, React state, localStorage and all rendered handlers remain production code.
const featuredData = await import("../shell/featured-apps.mjs");
function compileComponent(text, filename, dependencies, context = {}) {
  const result = ts.transpileModule(text, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      ...context,
      require(name) {
        assert.ok(name in dependencies, `unmocked component dependency: ${name}`);
        return dependencies[name];
      },
    },
    { filename },
  );
  return module.exports;
}
const sortingPath = fileURLToPath(new URL("../vendor/dyad/src/lib/sortApps.ts", import.meta.url));
const sorting = compileComponent(fs.readFileSync(sortingPath, "utf8"), sortingPath, {});
const makeApp = (id) => ({
  id,
  name: `Local app ${id}`,
  isFavorite: false,
  createdAt: `2026-11-${String(id).padStart(2, "0")}T00:00:00Z`,
  updatedAt: `2026-11-${String(id).padStart(2, "0")}T00:00:00Z`,
});
async function withShowcase(
  run,
  componentSource = source,
  initialApps = [1, 2, 3, 4].map(makeApp),
) {
  window.localStorage.clear();
  let apps = initialApps,
    thumbnailIds = [],
    pictureIds = new Set();
  const opened = [];
  const { FeaturedAppShowcase } = compileComponent(
    componentSource,
    upstream,
    {
      react: require("react"),
      "react/jsx-runtime": require("react/jsx-runtime"),
      "@tanstack/react-router": { useNavigate: () => () => {} },
      "lucide-react": { Star: () => null, ArrowRight: () => null, Search: () => null },
      "@/hooks/useLoadApps": { useLoadApps: () => ({ apps }) },
      "@/hooks/useOpenApp": { useOpenApp: () => (id) => opened.push(id) },
      "@/hooks/useAppThumbnails": {
        useAppThumbnails: (ids) => {
          thumbnailIds = [...ids];
          return new Map(
            ids.filter((id) => pictureIds.has(id)).map((id) => [id, `blob:checked-${id}`]),
          );
        },
      },
      "@/lib/sortApps": sorting,
      "../../hologram.featured-apps.mjs": featuredData,
    },
    { window },
  );
  const container = document.createElement("div");
  document.body.append(container);
  let root = createRoot(container);
  const render = () => act(async () => root.render(createElement(FeaturedAppShowcase)));
  const button = (name) =>
    [...container.querySelectorAll("button")].find((node) => node.textContent === name);
  const click = async (node) => {
    assert.ok(node, "expected rendered control");
    await act(async () => node.click());
  };
  const cards = () => [...container.querySelectorAll('[data-testid^="app-showcase-card-"]')];
  const h = {
    container,
    opened,
    button,
    click,
    cards,
    titles: () => cards().map((node) => node.getAttribute("title")),
    thumbnails: () => thumbnailIds,
    empty: () => container.querySelector('[data-slot="home-featured-empty"]')?.textContent,
    bookmarks: () => JSON.parse(window.localStorage.getItem("foundry:bookmarks") ?? "[]"),
    keep: async (id) =>
      click(container.querySelector(`button[aria-label="Bookmark Local app ${id}"]`)),
    setApps: async (next) => {
      apps = next;
      await render();
    },
    setPictures: async (ids) => {
      pictureIds = new Set(ids);
      await render();
    },
    remount: async () => {
      await act(async () => root.unmount());
      root = createRoot(container);
      await render();
    },
    query: async (value) => {
      if (!container.querySelector('[data-slot="home-featured-query"]'))
        await click(container.querySelector('[data-slot="home-featured-search"]'));
      const input = container.querySelector('[data-slot="home-featured-query"]');
      // Happy DOM does not prove browser input synthesis. Invoke the actual input's rendered handler;
      // source_bound_gallery_browser uses Playwright fill against the built renderer separately.
      const props = Object.keys(input).find((key) => key.startsWith("__reactProps$"));
      assert.ok(props);
      await act(async () => input[props].onChange({ target: { value } }));
      assert.equal(input.value, value);
    },
  };
  await render();
  try {
    await run(h);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}
async function savedSurvivesRankChange(h) {
  await h.click(h.button("My apps"));
  assert.deepEqual(h.titles(), ["Local app 4", "Local app 3", "Local app 2", "Local app 1"]);
  await h.keep(1);
  await h.click(h.button("Bookmarked"));
  assert.deepEqual(h.titles(), ["Local app 1"]);
  await h.setApps([1, 2, 3, 4, 5].map(makeApp));
  assert.deepEqual(h.bookmarks(), ["app:1"]);
  assert.deepEqual(h.titles(), ["Local app 1"], "a newer unrelated app must not hide a saved app");
}
async function queryFindsOldApp(h) {
  await h.setApps([1, 2, 3, 4, 5, 6].map(makeApp));
  await h.click(h.button("My apps"));
  await h.query("  LOCAL app 1  ");
  assert.deepEqual(h.titles(), ["Local app 1"], "query must select before the preview limit");
  assert.deepEqual(h.thumbnails(), [1], "only actual visible own-app IDs may request thumbnails");
}
test("saved own app survives a fifth app, rank updates, view toggles and remount", async () => {
  await withShowcase(async (h) => {
    await savedSurvivesRankChange(h);
    await h.setApps([1, 2, 3, 4, 5, 6].map(makeApp));
    for (let repeat = 0; repeat < 2; repeat++) {
      await h.click(h.button("Featured"));
      await h.click(h.button("Bookmarked"));
      assert.deepEqual(h.titles(), ["Local app 1"]);
      await h.remount();
      await h.click(h.button("Bookmarked"));
      assert.deepEqual(h.titles(), ["Local app 1"]);
    }
    await h.keep(1);
    assert.deepEqual(h.bookmarks(), []);
    assert.deepEqual(h.titles(), []);
    assert.equal(h.empty(), "Nothing bookmarked yet. The star on a card keeps it here.");
    await h.remount();
    await h.click(h.button("Bookmarked"));
    assert.deepEqual(h.titles(), []);
    assert.deepEqual(h.opened, []);
  });
});
test("search spans the full own-app collection with checked visible thumbnails and local fallbacks", async () => {
  await withShowcase(async (h) => {
    assert.deepEqual(h.thumbnails(), [], "Featured must not request unrelated own-app media");
    assert.ok(h.cards().every((card) => card.querySelector("svg") && !card.querySelector("img")));
    await queryFindsOldApp(h);
    assert.ok(h.cards()[0].querySelector("svg"));
    assert.equal(h.cards()[0].querySelector("img"), null);
    await h.setPictures([1, 6]);
    assert.equal(h.cards()[0].querySelector("img")?.getAttribute("src"), "blob:checked-1");
    assert.equal(h.cards()[0].querySelector("svg"), null);
    await h.query("Local app");
    assert.equal(h.cards().length, featuredData.featuredOnHome);
    assert.deepEqual(h.thumbnails(), [6, 5, 4, 3]);
  });
});
test("search misses differ from empty collections and clearing search restores the selected view", async () => {
  await withShowcase(async (h) => {
    for (const view of ["Featured", "My apps", "Bookmarked"]) {
      await h.click(h.button(view));
      await h.query("does not exist");
      assert.equal(
        h.empty(),
        "Nothing matches that.",
        `${view} miss must not claim the collection is empty`,
      );
    }
    await h.query("");
    assert.equal(h.empty(), "Nothing bookmarked yet. The star on a card keeps it here.");
    await h.click(h.button("My apps"));
    assert.equal(h.cards().length, 4);
    await h.setApps([]);
    assert.equal(h.empty(), "No apps yet. Describe one in the box above.");
  });
});
test("saved filtering precedes the preview bound for mixed featured and own apps", async () => {
  await withShowcase(async (h) => {
    await h.click(h.container.querySelector('[data-slot="home-featured-keep"]'));
    await h.setApps([1, 2, 3, 4].map((id) => ({ ...makeApp(id), isFavorite: id === 2 })));
    await h.click(h.button("My apps"));
    for (const id of [1, 2, 3, 4]) await h.keep(id);
    await h.click(h.button("Bookmarked"));
    assert.equal(h.cards().length, featuredData.featuredOnHome, "mixed saved view stays bounded");
    assert.deepEqual(
      h.titles(),
      [featuredData.featuredApps[0].name, "Local app 2", "Local app 4", "Local app 3"],
      "catalogue order precedes own-app favorites and recency",
    );
    await h.query("Local app 1");
    assert.deepEqual(h.titles(), ["Local app 1"]);
    assert.deepEqual(h.thumbnails(), [1]);
  });
});
test("selection behavior rejects truncation-before-filter, unrelated media, and false empty-state mutations", async () => {
  for (const [before, after, oracle] of [
    [
      "sortAppsForShowcase(apps)",
      "sortAppsForShowcase(apps).slice(0, featuredOnHome)",
      savedSurvivesRankChange,
    ],
    [
      "shownMine.map((app) => app.id)",
      "mine.slice(0, featuredOnHome).map((app) => app.id)",
      queryFindsOldApp,
    ],
    [
      "{asked\n",
      "{false\n",
      async (h) => {
        await h.click(h.button("My apps"));
        await h.query("absent");
        assert.equal(h.empty(), "Nothing matches that.");
      },
    ],
  ]) {
    assert.ok(source.includes(before), `mutation anchor missing: ${before}`);
    await assert.rejects(withShowcase(oracle, source.replace(before, after)), {
      name: "AssertionError",
    });
  }
});
