// A sent prompt in the actual shell: on screen and out of the composer before the host has stored anything,
// replaced by its stored message without ever showing twice, withdrawn when the send is refused, and left
// to the queue when a turn is already running.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "../vendor/dyad/node_modules/playwright-core/index.mjs";
const root = fileURLToPath(new URL("../shell/", import.meta.url));
for (const name of ["core.wasm", "assets/index.js", "manifest.json", "sw.js", "provenance.json"]) assert.ok(fs.existsSync(path.join(root, name)), `Build and project the actual shell first: ${name}`);
const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".html": "text/html" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost"), relative = decodeURIComponent(url.pathname).replace(/^\/foundry\//, "");
  let file = path.resolve(root, relative);
  if ((file !== path.resolve(root) && !file.startsWith(root)) || relative.split("/").includes("..")) { res.writeHead(404); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) && !path.extname(file) && !relative.startsWith("p/")) file = path.join(root, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream"); res.setHeader("cache-control", "no-store"); res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/foundry/`, origin = new URL(base).origin;
const executablePath = process.env.CHROME_BIN || ["/usr/bin/chromium", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 844 } }), page = await context.newPage(), errors = [], sent = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let holdProvider = null;
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (["https://openrouter.ai/api/v1/chat/completions", "https://api.featherless.ai/v1/chat/completions", "https://prism-featherless.trinity-03d.workers.dev/v1/chat/completions"].includes(url.href)) {
      sent.push(request.postData()); if (holdProvider) await holdProvider;
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "data: " + JSON.stringify({ id: "instant-fixture", choices: [{ index: 0, delta: { content: "Answered." }, finish_reason: "stop" }] }) + "\n\ndata: [DONE]\n\n" });
    }
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.goto(base); await page.waitForFunction(() => !!window.__host && !!window.__prism && !!window.electron);
  const call = (channel, input) => page.evaluate(({ channel, input }) => window.electron.ipcRenderer.invoke(channel, input), { channel, input });
  await call("set-user-settings", { selectedModel: { provider: "featherless", name: "zai-org/GLM-5.3-Flash" }, providerSettings: { featherless: { apiKey: { value: "instant-fixture" } } } });
  const made = await call("create-app", { name: "instant-message", initialChatMode: "ask" }), chatId = made.chatId, appId = made.app.id;
  await page.goto(`${base}chat?id=${chatId}&appId=${appId}`);
  const input = page.getByTestId("chat-input-container").getByRole("textbox"), list = page.getByTestId("messages-list"); await input.waitFor();
  // The host admits a turn under the chat queue's own lock: holding that lock from here holds the admission,
  // and refusing it once refuses the send. What is on screen meanwhile is the renderer's alone.
  const hold = () => page.evaluate((name) => { window.__held = new Promise((held) => { void navigator.locks.request(name, () => new Promise((release) => { window.__release = release; held(); })); }); return window.__held; }, `foundry:chat-queue:${chatId}`);
  const release = () => page.evaluate(() => window.__release());
  const refuseOnce = () => page.evaluate(() => { const real = LockManager.prototype.request; LockManager.prototype.request = function (name, ...rest) { if (String(name).startsWith("foundry:chat-queue:")) { LockManager.prototype.request = real; return Promise.reject(new Error("refused by the test")); } return real.call(this, name, ...rest); }; });
  const stored = async () => (await call("get-chat", chatId)).messages.map((m) => m.content);
  const view = (prompt) => page.evaluate((prompt) => { const text = document.querySelector('[data-testid="messages-list"]')?.textContent || ""; return { copies: text.split(prompt).length - 1, pending: document.querySelectorAll('[data-slot="pending-user-message"]').length, composer: document.querySelector('[data-testid="chat-input-container"] [role=textbox]').textContent }; }, prompt);
  // Every later check also holds over time: the prompt is never on screen twice.
  const watch = (prompt) => page.evaluate((prompt) => { window.__most = 0; window.__watch?.disconnect(); window.__watch = new MutationObserver(() => { const text = document.querySelector('[data-testid="messages-list"]')?.textContent || ""; window.__most = Math.max(window.__most, text.split(prompt).length - 1); }); window.__watch.observe(document.body, { subtree: true, childList: true, characterData: true }); }, prompt);
  const most = () => page.evaluate(() => window.__most);
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const consent = async () => { const button = page.getByRole("button", { name: "Send this request", exact: true }); await button.waitFor(); await button.click(); };

  // 1. The first message of an empty conversation, with the host's admission held: shown, composer empty, nothing stored.
  const first = "Is the first message shown at once?";
  await hold(); await watch(first);
  await input.fill(first); await input.press("Enter"); await frames();
  assert.deepEqual(await view(first), { copies: 1, pending: 1, composer: "" });
  await page.waitForTimeout(400);
  assert.deepEqual(await stored(), [], "the host has stored nothing yet");
  assert.equal(await page.locator('[data-slot="pending-user-message"][inert]').count(), 1, "not a stored message: it cannot be acted on");
  assert.deepEqual(await view(first), { copies: 1, pending: 1, composer: "" }, "still standing in while the host is held");
  await release();
  await consent(); await list.getByText("Answered.").first().waitFor();
  assert.deepEqual(await view(first), { copies: 1, pending: 0, composer: "" }); assert.equal(await most(), 1, "never beside its stored message");
  assert.deepEqual((await stored()).slice(0, 1), [first]);

  // 2. A refused send: the message is withdrawn and the composer has its words back.
  const refused = "Is a refused message taken back?";
  await refuseOnce(); await watch(refused);
  await input.fill(refused); await input.press("Enter");
  await page.waitForFunction((refused) => document.querySelectorAll('[data-slot="pending-user-message"]').length === 0 && document.querySelector('[data-testid="chat-input-container"] [role=textbox]').textContent === refused, refused);
  assert.equal((await view(refused)).copies, 0); assert.equal(await most(), 1, "it was shown, once, while the send was in flight");
  assert.ok(!(await stored()).includes(refused)); assert.equal(sent.length, 1);

  // 3. The same words then send normally; while that turn runs, another prompt is queued, not shown as a message.
  let releaseProvider; holdProvider = new Promise((resolve) => { releaseProvider = resolve; });
  await watch(refused); await input.press("Enter"); await frames();
  assert.deepEqual(await view(refused), { copies: 1, pending: 1, composer: "" });
  await consent(); await page.waitForFunction(() => document.querySelectorAll('[data-slot="pending-user-message"]').length === 0);
  const queued = "Is a queued prompt left to the queue?";
  await input.fill(queued); await input.press("Enter"); await frames();
  assert.equal((await view(queued)).pending, 0); assert.equal((await view(queued)).copies, 0, "a queued prompt is not a message yet");
  await page.getByText(queued).first().waitFor();
  releaseProvider(); holdProvider = null;
  await list.getByText("Answered.").nth(1).waitFor();
  assert.equal(await most(), 1); assert.equal((await view(refused)).copies, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ profile: "foundry/instant-user-message/1", shownBeforeStored: true, composerCleared: true, neverTwice: true, refusedWithdrawn: true, draftRestored: true, queuedLeftToQueue: true, pageErrors: errors }));
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
