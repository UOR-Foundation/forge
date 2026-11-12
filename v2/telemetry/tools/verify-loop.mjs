// Development only: runs `lexlean verify --all` in the SDK image (sdk.sh) until Lean accepts every
// theorem. When the only refusal is LLV7005 (a theorem's declared axiom set differs from the set Lean
// observed), the declaration's axiom list is set to the observed set and verify runs again; any other
// refusal stops the loop. Each round is logged to out/verify-rounds.log.
// Run (Windows): node v2/telemetry/tools/verify-loop.mjs
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("../", import.meta.url));
const wslPath = "/mnt/" + here[0].toLowerCase() + here.slice(2).replaceAll("\\", "/");
mkdirSync(here + "out", { recursive: true });
const log = (line) => { appendFileSync(here + "out/verify-rounds.log", line + "\n"); console.log(line); };
for (let round = 1; round <= 20; round++) {
  const t0 = Date.now();
  const r = spawnSync("wsl", ["-d", "Ubuntu", "--", "bash", wslPath + "sdk.sh", "lexlean fmt --all >/dev/null && lexlean lock >/dev/null && lexlean --diagnostic-format json verify --all; ls .lexlean/verified 2>/dev/null"], { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" }, maxBuffer: 1 << 26 });
  const out = (r.stdout + r.stderr).replaceAll("\0", "");
  let result = null;
  for (const line of out.split("\n")) { try { const j = JSON.parse(line); if (j.spec === "lexlean/command-result/1") result = j; } catch {} }
  const s = Math.round((Date.now() - t0) / 1000);
  if (!result) { log(`round ${round} (${s} s): no result, retrying in 30 s: ${out.trim().slice(-300)}`); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000); continue; }
  if (result.success) { log(`round ${round} (${s} s): verified. ${out.split("\n").filter((l) => /^[0-9a-f]{64}$/.test(l.trim())).join(" ")}`); process.exit(0); }
  const d = result.diagnostics;
  log(`round ${round} (${s} s): ${d.map((x) => x.code + " " + x.message.slice(0, 200)).join(" | ")}`);
  const fixes = d.map((x) => /`PrismTelemetry\.(\w+)\.(\w+)` violates its exact axiom policy: observed \[([^\]]*)\]/.exec(x.message)).filter(Boolean);
  if (fixes.length !== d.length) process.exit(1);
  for (const [, module, name, observed] of fixes) {
    const file = here + "src/" + module + ".lex.tex";
    let text = readFileSync(file, "utf8");
    const at = text.indexOf("name: " + name + ",");
    const a = text.indexOf("axioms: [", at), b = text.indexOf("]", a);
    text = text.slice(0, a) + "axioms: [" + observed + text.slice(b);
    writeFileSync(file, text);
  }
}
process.exit(1);
