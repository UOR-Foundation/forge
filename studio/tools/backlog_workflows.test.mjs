import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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


test("Studio collects independent browser failures without bypassing verified prerequisites", () => {
  const studio = workflow("studio.yml");
  const guard = "if: ${{ !cancelled() && steps.shell_closure.conclusion == 'success' && steps.corpus.conclusion == 'success' }}";
  // Pin reviewed command identities and arguments, not just a count: a dropped gate
  // must not be replaced by a duplicate or an unrelated command without review.
  const cases = [
    ["Check the declared host scope and real renderer error recovery", [
      "run node tools/contract_shapes.mjs --check",
      "run node tools/renderer_boundary.mjs",
      "run node tools/renderer_inputs.mjs",
      "run node tools/privacy_projection.mjs",
      "run node tools/privacy_browser.mjs",
      "run node tools/privacy_shell_browser.mjs",
      "run node tools/editor_browser.mjs",
      "run node tools/editor_load_lifecycle_browser.mjs",
      "run node tools/compiler_browser.mjs",
    ]],
    ["Verify snapshot rollback in browser storage", [
      "run node tools/snapshot_restore_browser.mjs",
      "run node tools/storage_request_browser.mjs",
      "run node tools/project_creation_browser.mjs",
      "run node tools/verified_project_import_browser.mjs",
      "run node tools/verified_shell_cache_browser.mjs",
      "run node tools/project_edit_browser.mjs",
      "run node tools/project_lifecycle_browser.mjs",
      "run node tools/build_source_browser.mjs",
      "run node tools/build_modules_browser.mjs",
      "run node tools/generation_patch_browser.mjs",
      "run node tools/canonical_model_edits_browser.mjs",
      "run node tools/canonical_generation_ownership_browser.mjs",
      "run node tools/canonical_build_closure_browser.mjs",
      "run node tools/preview_permissions_browser.mjs",
      "run node tools/durable_event_delivery_browser.mjs",
      "run node tools/stateful_application_journeys_browser.mjs",
      "run node tools/command_ownership_registry_browser.mjs",
      "run node tools/portable_build_permission_browser.mjs",
      "run node tools/github_publication_permission_browser.mjs",
      "run node tools/durable_build_work_browser.mjs",
      "run node tools/private_provider_credentials_browser.mjs",
      "run node tools/private_provider_credentials_artifact.mjs",
      "run node tools/semantic_routing_runtime.mjs",
      "run node tools/semantic_routing_browser.mjs",
      "run node tools/semantic_application_discovery_browser.mjs",
      "run node tools/chat_queue_runtime.mjs",
      "run node tools/version_preview_runtime.mjs",
      "run node tools/version_preview_browser.mjs",
      "run node tools/durable_version_preview_browser.mjs",
      "run node tools/verified_working_tree_browser.mjs",
      "run node tools/durable_prompt_library_browser.mjs",
      "run node tools/builtin_themes_projection.mjs --check",
      "run node tools/durable_theme_library_browser.mjs",
      "run node tools/sidebar_tool_access_browser.mjs",
      "run node tools/live_main_integration_browser.mjs",
      "run node tools/source_bound_gallery_browser.mjs",
      "run node tools/initial_project_theme_browser.mjs",
      "run node tools/module_presentation_browser.mjs",
      "run node tools/large_module_presentation_browser.mjs",
      "run node tools/kernel_owner_readiness_browser.mjs",
      "run node tools/kernel_owner_handoff_browser.mjs",
      "run node tools/renderer_stylesheet_identity_browser.mjs",
      "run node tools/home_card_keyboard_browser.mjs",
      "run node tools/atomic_browser_settings_browser.mjs",
      "run node tools/atomic_chat_preferences_browser.mjs",
      "run node tools/read_only_chat_execution_browser.mjs",
      "run node tools/chat_model_picker_scope_browser.mjs",
      "run python3 tools/chat_mode_catalog_projection.py --check",
      "run node tools/browser_chat_mode_controls_browser.mjs",
      "run node tools/plain_chat_layout_browser.mjs",
      "run node tools/chat_provider_routing_browser.mjs",
      "run node tools/preview_auto_start_browser.mjs",
      "run node tools/site_relay_authorization_browser.mjs",
      "run node tools/browser_window_coordination_browser.mjs",
      "run node tools/message_linked_restoration_browser.mjs",
      "run node tools/chat_queue_browser.mjs",
      "run node tools/durable_chat_queue_browser.mjs",
      "run node tools/canonical_version_history_browser.mjs",
      "run node tools/rules_source_browser.mjs",
      "run node tools/inference_effects_browser.mjs",
      "run node tools/hosted_source_permission_browser.mjs",
      "run node tools/inference_consent_browser.mjs",
      "run node tools/exact_representation_browser.mjs",
      "run node tools/provider_key_browser.mjs",
      "run node tools/covers_browser.mjs",
    ]],
  ];
  const auditCommands = (script, expected, name) => {
    const commands = script.split("\n").filter(line => /^run\s/.test(line));
    assert.equal(new Set(expected).size, expected.length, `duplicate reviewed command for ${name}`);
    assert.equal(new Set(commands).size, commands.length, `duplicate mandatory command for ${name}`);
    assert.deepEqual(commands, expected, `mandatory command inventory changed for ${name}`);
  };
  const audit = source => {
    assert.match(source, /id: shell_closure\n/); assert.match(source, /id: corpus\n/);
    for (const [name, expected] of cases) {
      const block = source.split(`      - name: ${name}\n`)[1]?.split("      - name:")[0];
      assert.ok(block?.includes(guard), `unverified prerequisites for ${name}`);
      const script = block.split("        run: |\n")[1].split("\n").map(line => line.replace(/^          /, "")).join("\n");
      auditCommands(script, expected, name);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foundry-gate-")), log = path.join(dir, "ran");
      let index = 0;
      const probe = script.replace(/^run (node|python3) tools\/.*$/gm, () => `run node -e 'require("node:fs").appendFileSync(${JSON.stringify(log)}, "${index}\\n");process.exit(${index++ === 1 ? 7 : 0})'`);
      try {
        const result = spawnSync("bash", ["-e", "-c", probe], { encoding: "utf8" });
        assert.equal(result.status, 1, `a failed command did not fail ${name}: ${result.stderr}`);
        assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), Array.from({ length: expected.length }, (_, i) => String(i)), `a failure omitted later commands in ${name}`);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  };
  audit(studio);
  for (const [name, expected] of cases) {
    const script = expected.join("\n");
    for (const command of expected) {
      assert.throws(() => auditCommands(script.replace(command, ""), expected, name), /inventory changed/);
      assert.throws(() => auditCommands(script.replace(command, "run node tools/unreviewed.mjs"), expected, name), /inventory changed/);
    }
    assert.throws(() => auditCommands(`${script}\nrun node tools/unreviewed.mjs`, expected, name), /inventory changed/);
    assert.throws(() => auditCommands(script.replace(expected[0], expected[1]), expected, name), /duplicate mandatory command/);
    assert.throws(() => auditCommands([expected[1], expected[0], ...expected.slice(2)].join("\n"), expected, name), /inventory changed/);
  }
  const plainChat = "          run node tools/plain_chat_layout_browser.mjs\n";
  assert.throws(() => audit(studio.replace(plainChat, "")), /inventory changed/);
  assert.throws(() => audit(studio.replace(plainChat, "          run node tools/unreviewed.mjs\n")), /inventory changed/);
  assert.throws(() => audit(studio.replace(plainChat, `          if false; then\n${plainChat}          fi\n`)), /omitted later commands/);
  assert.throws(() => audit(studio.replaceAll('exit "$status"', 'exit 0')), /did not fail/);
  assert.throws(() => audit(studio.replaceAll('"$@" || status=1', '"$@"')), /did not fail|omitted later commands/);
  assert.throws(() => audit(studio.replaceAll(guard, 'if: always()')), /unverified prerequisites/);
});
