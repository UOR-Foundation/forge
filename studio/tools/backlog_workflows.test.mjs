import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const workflow = name => fs.readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");

test("Forge reuse and performance include every imported stateful engine source", () => {
  const pages = workflow("pages.yml");
  const address = pages.split("id: forge-address")[1].split("id: forge-reuse")[0];
  const projector = fs.readFileSync(new URL("./v2_engine.mjs", import.meta.url), "utf8");
  const declarations = projector.slice(projector.indexOf("const COPIES ="), projector.indexOf("const mode ="));
  const { COPIES, DERIVED } = vm.runInNewContext(declarations + ";({COPIES,DERIVED})", { JSON });
  const inputs = [...Object.values(COPIES), ...Object.values(DERIVED).map(([source]) => source)];
  assert.ok(inputs.length > 0, "engine input audit cannot be empty");
  const matches = (pattern, file) => pattern === "**" || (pattern.endsWith("/**") ? file.startsWith(pattern.slice(0, -2)) : file === pattern);
  const patterns = [...address.matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const input of inputs) {
    let included = false;
    for (const pattern of patterns) {
      const exclude = pattern.startsWith("!"), glob = exclude ? pattern.slice(1) : pattern;
      if (matches(glob, input)) included = !exclude;
    }
    assert.ok(included, `reuse omits ${input}`);
    for (const name of ["forge-perf.yml", "studio.yml"]) {
      const triggers = workflow(name).split("permissions:")[0];
      const events = [...triggers.matchAll(/(?:^|\n)  (push|pull_request):\n([\s\S]*?)(?=\n  [a-z_]+:|$)/g)];
      assert.ok(events.length > 0, `${name} has no checked event`);
      for (const [, event, body] of events) {
        const filters = [...body.matchAll(/"([^"\n]+)"/g)].map(match => match[1]);
        assert.ok(filters.some(pattern => matches(pattern, input)), `${name} ${event} omits ${input}`);
      }
    }
  }
});

test("integrated performance uses the locked installed browser and portable script invocation", () => {
  const perf = workflow("forge-perf.yml");
  assert.ok(perf.includes('node vendor/dyad/node_modules/playwright-core/cli.js install --with-deps chromium'));
  assert.ok(perf.includes('export PLAYWRIGHT_MODULE="${GITHUB_WORKSPACE}/studio/vendor/dyad/node_modules/playwright-core/index.mjs"'));
  assert.ok(perf.includes('bash scripts/live_e2e_all.sh shell "$RUNNER_TEMP/live-e2e"'));
  assert.ok(!perf.includes('npm root --global'), "unlocked browser fallback");
});

test("Pages cache misses retain compiler renderer closure and acceptance ordering", () => {
  const pages = workflow("pages.yml").split("  forge:")[1].split("  deploy:")[0];
  const names = [
    "Install the locked browser compiler archive",
    "The vendored renderer, built beside the shell as the homepage (no Electron, no src/pro)",
    "The lane, which projects the page from the verified core and builds the wasm the page loads",
    "Independently verify staged editor bytes against the locked npm archive",
    "Verify every staged renderer, scaffold and shell byte before acceptance",
    "Byte identity corpus and shell hash check",
  ];
  let previous = -1;
  for (const name of names) {
    const marker = `      - name: ${name}\n`, index = pages.indexOf(marker);
    assert.ok(index > previous, `missing or misordered ${name}`);
    assert.equal(pages.indexOf(marker, index + marker.length), -1, `duplicate ${name}`);
    const step = pages.slice(index + marker.length).split("      - ")[0];
    assert.ok(step.includes("if: steps.forge-reuse.outputs.cache-hit != 'true'"), `reuse bypass in ${name}`);
    assert.ok(step.includes("run:"), `no command for ${name}`);
    previous = index;
  }
});
