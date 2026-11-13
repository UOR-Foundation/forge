// Actual built shell and paid inference adapter; provider transport is intercepted.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "../vendor/dyad/node_modules/playwright-core/index.mjs";
assert.equal(JSON.parse(fs.readFileSync(new URL("../vendor/dyad/node_modules/monaco-editor/package.json", import.meta.url), "utf8")).version, "0.52.2");
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
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/foundry/`, origin = new URL(base).origin;
const executablePath = process.env.CHROME_BIN || ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ serviceWorkers: "block" }), page = await context.newPage(), errors = [], submitted = [];
  page.on("pageerror", error => errors.push(error.message));
  let hold = false, release, redirect = false, redirected = 0;
  const chunk = (delta, finish_reason = null) => ({ id: "fixture", model: "model", choices: [{ index: 0, delta, finish_reason }] });
  const stream = [chunk({ content: "fixture answer" }), chunk({}, "stop"), { id: "fixture", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }].map(value => `data: ${JSON.stringify(value)}\n\n`).join("") + "data: [DONE]\n\n";
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (["https://openrouter.ai/api/v1/chat/completions", "https://api.featherless.ai/v1/chat/completions"].includes(url.href)) {
      submitted.push({ url: url.href, body: route.request().postData(), cookie: route.request().headers().cookie });
      if (redirect) { await route.fulfill({ status: 302, headers: { location: "https://redirect.invalid/leak" } }); return; }
      if (hold) { await new Promise(resolve => { release = resolve; }); try { await route.abort(); } catch {} return; }
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: stream }); return;
    }
    if (url.href === "https://redirect.invalid/leak") redirected++;
    if (url.origin === origin) return route.continue();
    return route.abort();
  });
  await page.goto(base); await page.waitForFunction(() => !!window.__host && !!window.electron);
  await page.evaluate(async base => {
    window.testInference = await import(base + "inference.js");
    await window.testInference.settingsPut({ providerSettings: { openrouter: { apiKey: { value: "browser-secret-key" } }, featherless: { apiKey: { value: "browser-secret-key" } } } });
  }, base);
  const start = async (provider = "openrouter") => {
    await page.evaluate(provider => {
      window.testResult = null; window.testAbort = new AbortController();
      void window.testInference.paidGenerate({ model: provider + "/model", messages: [{ role: "user", content: '<script>window.__consentInjection=true</script> exact private prompt' }], max_tokens: 512, temperature: "0.7" }, null, window.testAbort.signal).then(result => { window.testResult = { text: result.text }; }, error => { window.testResult = { code: error.code }; });
    }, provider);
  };
  const result = async () => { await page.waitForFunction(() => window.testResult !== null); return page.evaluate(() => window.testResult); };
  const dialog = page.getByRole("dialog", { name: "Review cloud request" });
  await start(); await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Don't send");
  assert.equal(submitted.length, 0);
  await page.keyboard.press("Escape"); assert.equal((await result()).code, "inferenceConsentDenied"); assert.equal(submitted.length, 0);
  await start(); await dialog.waitFor(); await page.getByRole("button", { name: "Don't send", exact: true }).click(); assert.equal((await result()).code, "inferenceConsentDenied");
  await start(); await dialog.waitFor(); await page.evaluate(() => window.testAbort.abort()); assert.equal((await result()).code, "inferenceConsentCancelled");
  for (const provider of ["openrouter", "featherless"]) {
    await start(provider); await dialog.waitFor();
    const disclosed = await dialog.locator("pre").textContent();
    assert.ok(disclosed.includes('exact private prompt')); assert.equal(await page.evaluate(() => window.__consentInjection || false), false);
    assert.ok(!(await dialog.textContent()).includes("browser-secret-key"));
    assert.ok((await dialog.textContent()).includes("your configured API key"));
    await page.getByRole("button", { name: "Send this request", exact: true }).click();
    assert.equal((await result()).text, "fixture answer");
    assert.equal(submitted.at(-1).body, disclosed); assert.equal(submitted.at(-1).cookie, undefined);
    assert.equal(await page.getByRole("complementary", { name: "Active cloud request" }).count(), 0);
  }
  assert.equal(submitted.length, 2);
  redirect = true; await start(); await dialog.waitFor();
  await page.getByRole("button", { name: "Send this request", exact: true }).click();
  assert.equal((await result()).code, "inferenceNetworkFailed"); assert.equal(redirected, 0); redirect = false;
  // A second request needs fresh approval, even after a successful response.
  hold = true; await start(); await dialog.waitFor(); assert.equal(submitted.length, 3);
  await page.getByRole("button", { name: "Send this request", exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector('aside[aria-label="Active cloud request"]'));
  // Wait for route observation rather than treating a local button as transmission evidence.
  for (let i=0; !release && i<100; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(release); await page.getByRole("button", { name: "Stop cloud request (openrouter)", exact: true }).click();
  assert.equal((await result()).code, "inferenceCancelled"); release(); hold = false;
  await context.setOffline(true); await start(); assert.equal((await result()).code, "inferenceOffline");
  assert.equal(submitted.length, 4); assert.equal(await dialog.count(), 0);
  await context.setOffline(false);
  const expired = await page.evaluate(async base => {
    const { authorizeInference } = await import(base + "inference-consent.mjs");
    try { await authorizeInference({ provider: "openrouter", model: "model", bytes: "{}", credentialOwner: "visitor" }, { timeoutMs: 10 }); }
    catch (error) { return error.code; }
  }, base);
  assert.equal(expired, "inferenceConsentTimedOut");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ actualPaidAdapter: true, providers: 2, exactDisclosedBodies: true, deniedSubmissions: 0, repeatedApproval: true, pendingCancel: true, activeStop: true, redirects: "refused", offline: "refused", timeout: "refused", pageExceptions: 0 }));

} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
