// Every script the shell ships, parsed the way the browser parses it.
//
//   node tools/shell_parse.mjs
//
// The page loads host.js, appearance.js and holo.js as ES modules and sw.js as a classic worker
// script, and a file the browser cannot parse takes the whole page down with one line in the console
// and no clue which file it was: the host never installs, so the renderer finds no IPC and draws
// nothing. Nothing in the lane read these files as code -- the corpus check hashes them, the contract
// check reads the host as text -- so a stray character could be, and once was, published.
//
// `node --check` decides the syntax by the file's extension, and a raw newline inside a string is a
// syntax error only under the module goal, so each file is checked under the goal the browser uses
// for it: a copy with an .mjs extension for a module, .cjs for a worker script.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// sw.template.js is sw.js before the projector writes the closure digest into it; both are checked,
// because a defect in the template reaches every future release.
const GOAL = { "build-modules.mjs": "mjs", "build-source.mjs": "mjs", "project-lifecycle.mjs": "mjs", "generation-patch.mjs": "mjs", "project-edit.mjs": "mjs", "project-creation.mjs": "mjs", "storage-request.mjs": "mjs", "work-codec.mjs": "mjs", "provider-key-validation.mjs": "mjs", "exact-representation.mjs": "mjs", "inference-effects.mjs": "mjs", "rules-source.mjs": "mjs", "composition-codec.mjs": "mjs", "snapshot-restore.mjs": "mjs", "publication-identity.mjs": "mjs", "publication-effects.mjs": "mjs", "host-boundary.mjs": "mjs", "host.js": "mjs", "appearance.js": "mjs", "holo.js": "mjs", "inference.js": "mjs", "prompts.js": "mjs", "prism.js": "mjs", "github-build.js": "mjs", "sw.js": "cjs", "sw.template.js": "cjs", "kernel.js": "cjs" };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shell-parse-"));
let bad = 0;
for (const name of fs.readdirSync(path.join(root, "shell")).filter((f) => /\.(mjs|js)$/.test(f)).sort()) {
  const goal = GOAL[name];
  if (!goal) { console.log(`${name.padEnd(18)} no goal recorded -- add it to GOAL in tools/shell_parse.mjs`); bad += 1; continue; }
  const copy = path.join(dir, name.replace(/\.js$/, "." + goal));
  fs.copyFileSync(path.join(root, "shell", name), copy);
  try {
    execFileSync(process.execPath, ["--check", copy], { stdio: ["ignore", "ignore", "pipe"] });
    console.log(`${name.padEnd(18)} parses as ${goal === "mjs" ? "a module" : "a classic script"}`);
  } catch (e) {
    bad += 1;
    console.log(`${name.padEnd(18)} DOES NOT PARSE as ${goal === "mjs" ? "a module" : "a classic script"}`);
    console.log(String(e.stderr || e).replace(new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "shell/" + name).trim().split("\n").slice(0, 6).map((l) => "  " + l).join("\n"));
  }
}
fs.rmSync(dir, { recursive: true, force: true });
if (bad) { console.log(`\n${bad} shell script(s) the browser could not load`); process.exit(1); }
console.log("\nevery shell script parses under the goal the browser uses for it");
