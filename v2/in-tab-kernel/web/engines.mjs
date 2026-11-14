// Runs web/bench.html in each browser engine Playwright has installed and writes evidence/engines.json.
//   node web/engines.mjs <path to a playwright install> [runs]
// It starts web/serve.mjs itself: no COOP or COEP header, and the worker's network closed. A phone row is an engine
// with a phone's viewport and user agent on this machine's CPU; it says nothing of a phone's speed or memory.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const [install, runs = "7"] = process.argv.slice(2);
const require = createRequire(pathToFileURL(path.resolve(install, "package.json")));
const { firefox, webkit, devices } = require("playwright");
const port = 8794;
const server = spawn(process.execPath, [path.join(here, "serve.mjs"), String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const targets = [
  ["firefox", firefox, {}],
  ["webkit", webkit, {}],
  ["webkit, iPhone 15 viewport and user agent (emulated)", webkit, devices["iPhone 15"]],
];
const rows = [];
for (const [name, engine, context] of targets) {
  const row = { engine: name };
  let browser;
  try {
    browser = await engine.launch();
    row.version = browser.version();
    const page = await (await browser.newContext(context)).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(`http://localhost:${port}/web/bench.html?runs=${runs}&whole=1`);
    await page.waitForFunction(() => window.__bench !== undefined, null, { timeout: 240000 });
    const r = await page.evaluate(() => window.__bench);
    if (r.error || !r.summary) Object.assign(row, { failed: r.error ?? r.open?.refusal ?? "no summary", errors });
    else {
      const inputs = Object.values(r.inputs), span = (k) => [Math.round(Math.min(...inputs.map((x) => x[k]))), Math.round(Math.max(...inputs.map((x) => x[k])))];
      Object.assign(row, {
        userAgent: r.userAgent, crossOriginIsolated: r.crossOriginIsolated, sharedArrayBuffer: r.sharedArrayBuffer,
        kernel: r.open.kernel, fetchMs: Math.round(r.fetchMs), hashMs: Math.round(r.open.timings.hashMs), readyMs: Math.round(r.open.timings.readyMs),
        libraryMs: Math.round(r.open.timings.libraryMs), openTotalMs: Math.round(r.open.totalMs), heapMB: r.open.heapMB,
        project: { inputs: inputs.length, agreeWithNative: r.summary.agree, kernelMedianMs: span("kernelMs"), roundTripMedianMs: span("roundTripMs"), roundTripWorstMs: span("worstRoundTripMs")[1] },
        wholeFromNothing: r.whole && { accepted: r.whole.accepted, ms: Math.round(r.whole.kernelMs), heapMB: r.whole.heapMB },
        addressFaults: Object.fromEntries(Object.entries(r.faults).map(([k, v]) => [k, v.refused ? "refused" : "ACCEPTED"])),
      });
    }
  } catch (e) { row.failed = String(e && e.message || e).split("\n")[0].slice(0, 300); }
  finally { if (browser) await browser.close().catch(() => {}); }
  rows.push(row);
  console.log(JSON.stringify(row.failed ? { engine: name, version: row.version, failed: row.failed } : { engine: name, version: row.version, open: row.openTotalMs, library: row.libraryMs, project: row.project, whole: row.wholeFromNothing, faults: row.addressFaults }));
}
server.kill();
fs.writeFileSync(path.join(here, "..", "evidence", "engines.json"), JSON.stringify({ note: "web/bench.html through Playwright on one Windows 11 desktop. Playwright's WebKit is Safari's engine built for Windows, not Safari on a Mac or a phone.", runs: Number(runs), rows }, null, 1) + "\n");
process.exit(rows.some((r) => r.failed) ? 1 : 0);
