// Run: node v2/telemetry/egress-gate.mjs   (exit 1 on any finding)
// The static half of zero egress: no telemetry file can reach the network, and no file outside the
// telemetry can read a record. The model's half is `zeroEgress` (proved); the runtime half is the
// tripwire test in test.mjs and the request log of browser-test.mjs.
//
// What it refuses, in every shipped telemetry file (comments are stripped first, strings are not):
// a network API, a URL with a scheme, a postMessage to any origin ("*"), an import from anywhere but
// this tree or the shell's own files, a `.src =` that is not a relative URL; in each page, a missing
// `connect-src 'none'` or an external script, style or icon. Outside the telemetry: any import of the
// store or the telemetry module, so a record cannot be handed to code that has the network.
// It refuses its own blind spots: a file in this directory that is neither scanned nor named as a
// development file, a scanned file that is missing, and an empty scan.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = join(here, "..", "..");

export const SHIPPED = ["probe.mjs", "model.mjs", "store.mjs", "telemetry.mjs", "prometheus.mjs", "words.mjs", "panel.mjs", "replay.mjs", "frame.mjs", "fixtures.mjs", "panel.html", "frame.html"];
// Development files: they run on the developer's machine, never in the tab.
export const DEVELOPMENT = ["serve.mjs", "browser-test.mjs", "test.mjs", "defects.mjs", "egress-gate.mjs", "sdk.sh", "DESIGN.md", "VERIFICATION.md", "budgets.json", "lexlean.toml", "lexlean.lock", "lean-toolchain", "lakefile.toml", "lake-manifest.json", ".gitignore"];
const DIRECTORIES = ["src", "data", "tools", "out", ".lexlean"];
// Readers of records: only the panel and the tests.
const READERS = ["v2/telemetry/panel.mjs", "v2/telemetry/test.mjs", "v2/telemetry/defects.mjs", "v2/telemetry/browser-test.mjs"];

const NETWORK = [
  [/\bfetch\s*\(/, "fetch"], [/\bXMLHttpRequest\b/, "XMLHttpRequest"], [/\bWebSocket\b/, "WebSocket"], [/\bEventSource\b/, "EventSource"],
  [/\bsendBeacon\b/, "sendBeacon"], [/\bRTCPeerConnection\b/, "RTCPeerConnection"], [/\bWebTransport\b/, "WebTransport"], [/\bimportScripts\b/, "importScripts"],
  [/\bserviceWorker\b/, "serviceWorker"], [/\bwindow\.open\s*\(/, "window.open"], [/\bnew\s+(Shared)?Worker\s*\(/, "Worker"], [/\blocation\s*\.\s*(href|assign|replace)\b/, "navigation"],
  [/\b[a-z][a-z0-9+.-]*:\/\//i, "a URL with a scheme"], [/postMessage\([^)]*["']\*["']/, "postMessage to any origin"], [/\.src\s*=(?!\s*new URL\(["']\.\.?\/)/, "src set to something other than a relative URL"],
  [/\bnavigator\s*\.\s*(sendBeacon|connection)\b/, "navigator network"], [/\bsetAttribute\s*\(\s*["'](src|href|action)["']/, "src/href/action set by attribute"],
];

const stripComments = (text, html) => (html ? text.replace(/<!--[\s\S]*?-->/g, "") : text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1"));

export function scan(root = here, repoRoot = repo) {
  const findings = [];
  const at = (file, message) => findings.push(`${relative(repoRoot, join(root, file)).split(sep).join("/")}: ${message}`);
  for (const name of readdirSync(root)) {
    if (statSync(join(root, name)).isDirectory()) { if (!DIRECTORIES.includes(name)) at(name, "a directory the gate does not know"); continue; }
    if (!SHIPPED.includes(name) && !DEVELOPMENT.includes(name)) at(name, "neither scanned nor a development file");
  }
  let scanned = 0;
  for (const name of SHIPPED) {
    const path = join(root, name);
    if (!existsSync(path)) { at(name, "listed as shipped but missing"); continue; }
    const html = name.endsWith(".html"), text = stripComments(readFileSync(path, "utf8"), html);
    scanned++;
    text.split("\n").forEach((line, i) => { for (const [re, what] of NETWORK) if (re.test(line)) at(name, `line ${i + 1}: ${what}`); });
    if (!html) {
      for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)) {
        const spec = m[1] ?? m[2];
        if (!/^\.\.?\//.test(spec) && !/^node:/.test(spec)) at(name, `imports ${spec}`);
        else if (spec.startsWith("../")) { const target = relative(repoRoot, join(root, spec)).split(sep).join("/"); if (!/^(v2\/shell\/interp\.mjs|studio\/shell\/live\/(lexlean|project)\.mjs)$/.test(target)) at(name, `imports ${target}, outside the allowed shell files`); }
      }
      if (/^node:/m.test(text) && !["model.mjs"].includes(name)) for (const m of text.matchAll(/["'](node:[^"']+)["']/g)) at(name, `uses ${m[1]}`);
    } else {
      if (!/http-equiv="Content-Security-Policy"[^>]*connect-src 'none'/.test(text)) at(name, "no connect-src 'none' policy");
      for (const m of text.matchAll(/<(script|link|img|iframe)\b[^>]*\b(src|href)="([^"]*)"/g)) if (!/^(\.\/|data:,)/.test(m[3])) at(name, `${m[1]} ${m[2]}="${m[3]}"`);
      if (/<script(?![^>]*\bsrc=)[^>]*>/.test(text)) at(name, "an inline script");
    }
  }
  if (scanned === 0) findings.push("nothing scanned");
  // Outside the telemetry, nothing reads a record.
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (["node_modules", ".git", "target", ".lexlean", "vendor"].includes(n)) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(m?js|jsx|ts|tsx|html)$/.test(n) ? [p] : [];
  });
  for (const top of ["studio", "v2", "site", "app"].map((d) => join(repoRoot, d)).filter(existsSync)) {
    for (const file of walk(top)) {
      const rel = relative(repoRoot, file).split(sep).join("/");
      if (READERS.includes(rel) || rel.startsWith("v2/telemetry/")) continue;
      if (/telemetry\/(store|telemetry)\.mjs/.test(readFileSync(file, "utf8"))) findings.push(`${rel}: reads telemetry records`);
    }
  }
  return findings;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const findings = scan();
  for (const f of findings) console.log("refused: " + f);
  console.log(findings.length ? `egress gate: ${findings.length} finding(s)` : `egress gate: ${SHIPPED.length} files clean`);
  process.exit(findings.length ? 1 : 0);
}
