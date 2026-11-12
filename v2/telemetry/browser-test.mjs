// Run: node v2/telemetry/browser-test.mjs   (needs Chrome; CHROME=<path> to choose one)
// Drives the panel in headless Chrome over the DevTools protocol, with no test library: replays a
// build turn, adds the hand-measured turns, saves both Prometheus files through the page's own export,
// and records every request the page and its frame make. Passes only if
//   - the replayed turn produced every KPI the background lists (Checked included) and no reload,
//   - the loop suggests something for the over-budget KPIs and the model switch, and
//   - every request went to the page's own origin, and none at all happened after the page loaded.
// Writes the exported files to v2/telemetry/out/ for promtool (prometheus-check.sh).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const CHROMES = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const chrome = CHROMES.find((p) => existsSync(p));
if (!chrome) { console.error("no Chrome found; set CHROME"); process.exit(2); }

const server = spawn(process.execPath, [join(here, "serve.mjs")], { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "inherit"] });
const pageUrl = (await new Promise((r) => server.stdout.once("data", (d) => r(String(d).trim())))).replace("127.0.0.1", "localhost");
const origin = new URL(pageUrl).origin;

const profile = mkdtempSync(join(tmpdir(), "telemetry-chrome-"));
const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
// Chrome keeps writing to stderr; once the DevTools address is read, the rest is drained unread.
const wsBrowser = await new Promise((resolve) => {
  let buf = "";
  const read = (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { browser.stderr.off("data", read); browser.stderr.on("data", () => {}); resolve(m[1]); } };
  browser.stderr.on("data", read);
});
const port = new URL(wsBrowser).port;
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map(), requests = [], errors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data); globalThis.__count?.(m.method ?? "reply");
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent") requests.push({ url: m.params.request.url, t: Date.now() });
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === "Debugger.paused") { console.log("# paused at:", m.params.callFrames.slice(0, 6).map((f) => `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.location.lineNumber + 1}`).join(" <- ")); }
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text);
});
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => { if (process.env.DEBUG) console.log("# eval", Date.now() % 100000, expression.slice(0, 40)); const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok" : "not ok"} - ${what}`); if (!ok) failed++; };
try {
  await send("Network.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  // Network.enable on the page target also reports its frame's requests (same process, same origin).
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 100 && !(await evaluate("!!window.__telemetry").catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
  check(await evaluate("!!window.__telemetry"), "the panel loaded its model under connect-src 'none'");
  const loaded = requests.length;

  await evaluate(`document.getElementById("replay").click()`);
  let state = "";
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    state = await Promise.race([evaluate(`JSON.stringify({ busy: document.getElementById("replay").disabled, status: document.getElementById("status").textContent })`), new Promise((r) => setTimeout(() => r(null), 3000))]);
    if (state === null) { await send("Debugger.enable"); send("Debugger.pause"); await new Promise((r) => setTimeout(r, 2000)); throw new Error("the page's main thread is blocked"); }
    if (!JSON.parse(state).busy) break;
  }
  if (JSON.parse(state).busy) {
    const where = await evaluate(`(() => { const f = document.querySelector("iframe"); return JSON.stringify({ hidden: document.hidden, frame: !!f, title: f?.contentDocument?.getElementById("title")?.textContent, nodes: f?.contentDocument?.querySelectorAll(".node").length, probe: window.__telemetry.probe?.size, vis: document.visibilityState }); })()`);
    throw new Error("replay did not finish: " + state + " " + where + " errors: " + errors.join(" | "));
  }
  const replay = await evaluate(`window.__telemetry.telemetry.report().then(r => ({ turns: r.turns.length, kpis: r.turns[0]?.kpis, status: document.getElementById("status").textContent }))`);
  console.log("# replayed turn:", JSON.stringify(replay.kpis));
  console.log("# " + replay.status);
  const k = replay.kpis ?? {};
  for (const name of ["preview", "declaration", "pixel", "update", "edit", "checked", "built"]) check(Number.isFinite(k[name]) && k[name] > 0, `replayed turn measured ${name}: ${k[name]} us`);
  check(k.reloads === 0, "replayed turn: no preview reload");
  check(k.firstTry === 1 && k.repaired === 0, "replayed turn: the module read at the first try");
  check(k.rechecked === 1 && k.reused === 0, "replayed turn: one check run, none reused");
  check(k.checked < 3e6, "replayed turn: module complete to Checked within the kernel's budget (under 3 s)");
  const replayRequests = requests.length - loaded;
  // A replay after the frame exists loads the frame page once; the panel itself loads nothing more.
  check(requests.slice(loaded).every((r) => /\/v2\/telemetry\/(frame\.html|frame\.mjs|probe\.mjs)$/.test(r.url)), `during the replay the only requests were the frame's own files (${replayRequests})`);

  const before = requests.length;
  await evaluate(`document.getElementById("seed").click(); new Promise(r => setTimeout(r, 1500))`);
  const report = await evaluate(`window.__telemetry.telemetry.report().then(r => ({ turns: r.turns.length, suggestions: r.suggestions, switchTo: r.switchTo, cards: document.getElementById("suggestions").innerText }))`);
  console.log("# suggestions:", JSON.stringify(report.suggestions), JSON.stringify(report.switchTo));
  check(report.turns === 12, "12 turns stored: the replayed one and 11 hand-measured");
  check(report.suggestions.some((s) => s.kpi === "declaration" && s.lever === "reasoning"), "declaration over budget: the loop says the model reasons too long");
  check(report.suggestions.some((s) => s.kpi === "built"), "Enter to Checked over budget: the loop names its largest stage");
  check(report.suggestions.every((s) => ["declaration", "built"].includes(s.kpi)), "nothing within budget is suggested");
  check(report.switchTo?.to === "model-b", "the model switch names the model that reads at the first try more often");

  const snapshot = await evaluate(`window.__telemetry.telemetry.exportSnapshot({ userAct: true })`);
  const history = await evaluate(`window.__telemetry.telemetry.exportHistory({ userAct: true })`);
  const refused = await evaluate(`window.__telemetry.telemetry.exportSnapshot().then(() => "saved", e => e.code)`);
  check(refused === "telemetry.flowRefused", "saving without the user's act is refused by the model's gate");
  await evaluate(`document.getElementById("snapshot").click(); new Promise(r => setTimeout(r, 300))`);
  check(requests.length === before + requests.slice(before).filter((r) => r.url.startsWith("blob:")).length, `after the replay, seeding, the loop and both exports: no request except the saved file's own blob: (${requests.length - before})`);
  check(requests.every((r) => r.url.startsWith(origin + "/") || r.url.startsWith("blob:" + origin + "/") || r.url.startsWith("data:")), `every request of the session stayed on ${origin} (${requests.length} requests)`);
  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ").slice(0, 400) : ""));

  mkdirSync(join(here, "out"), { recursive: true });
  writeFileSync(join(here, "out", "prism.prom"), snapshot);
  writeFileSync(join(here, "out", "prism-history.om.txt"), history);
  writeFileSync(join(here, "out", "requests.json"), JSON.stringify(requests.map((r) => r.url), null, 1) + "\n");
} catch (e) { console.log("not ok - " + e.message); failed++; }
finally {
  ws.close(); browser.kill(); server.kill();
}
console.log(failed ? `# ${failed} failed` : "# all passed");
process.exit(failed ? 1 : 0);
