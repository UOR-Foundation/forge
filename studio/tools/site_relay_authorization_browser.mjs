// Durable guest-admitted delivery through actual host, bridge and IndexedDB.
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
  const context = await browser.newContext({ serviceWorkers: "block" }), page = await context.newPage(), errors = [], sent = [];
  const relay = "https://prism-featherless.trinity-03d.workers.dev/v1/chat/completions", direct = "https://api.featherless.ai/v1/chat/completions";
  page.on("pageerror", error => errors.push(error.message));
  const body = [{id:"fixture",choices:[{index:0,delta:{content:"relay fixture"},finish_reason:null}]},{id:"fixture",choices:[{index:0,delta:{},finish_reason:"stop"}]}].map(x=>`data: ${JSON.stringify(x)}\n\n`).join("")+"data: [DONE]\n\n";
  await context.route("**/*", route => {
    const request=route.request(),url=new URL(request.url());
    if([relay,direct].includes(url.href)){sent.push({url:url.href,headers:request.headers(),body:request.postData()});return route.fulfill({status:200,contentType:"text/event-stream",body});}
    return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(base);await page.waitForFunction(()=>!!window.__host&&!!window.electron);
  await page.evaluate(async base=>{window.inference=await import(base+"inference.js");await window.inference.settingsPut({});},base);
  const start=async(model="featherless/model")=>page.evaluate(model=>{window.result=null;window.controller=new AbortController();void window.inference.paidGenerate({model,messages:[{role:"user",content:"exact relay request"}]},null,window.controller.signal).then(x=>window.result={text:x.text},e=>window.result={code:e.code});},model);
  const result=async()=>{await page.waitForFunction(()=>window.result!==null);return page.evaluate(()=>window.result);};
  const dialog=page.getByRole("dialog",{name:"Review cloud request"}),approve=page.getByRole("button",{name:"Send this request",exact:true});
  await start();await dialog.waitFor();assert.equal(sent.length,0);assert.ok((await dialog.textContent()).includes(relay));assert.ok((await dialog.textContent()).includes("this site's shared API key"));
  await page.getByRole("button",{name:"Don't send",exact:true}).click();assert.equal((await result()).code,"inferenceConsentDenied");assert.equal(sent.length,0);
  await start();await dialog.waitFor();await page.evaluate(()=>window.controller.abort());assert.equal((await result()).code,"inferenceConsentCancelled");assert.equal(sent.length,0);
  await start();await dialog.waitFor();const disclosed=await dialog.locator("pre").textContent();assert.equal(sent.length,0);
  // Changing stored credentials while approval is pending cannot change the disclosed route.
  await page.evaluate(()=>window.inference.settingsPut({providerSettings:{featherless:{apiKey:{value:"site-relay"}}}}));
  await approve.click();assert.equal((await result()).text,"relay fixture");assert.equal(sent.length,1);assert.equal(sent[0].url,relay);assert.equal(sent[0].body,disclosed);assert.equal(sent[0].headers.authorization,undefined);assert.equal(sent[0].headers.cookie,undefined);
  await start();await dialog.waitFor();assert.ok((await dialog.textContent()).includes(direct));assert.ok((await dialog.textContent()).includes("your configured API key"));assert.ok(!(await dialog.textContent()).includes("site-relay"));assert.equal(sent.length,1);
  await approve.click();assert.equal((await result()).text,"relay fixture");assert.equal(sent.length,2);assert.equal(sent[1].url,direct);assert.equal(sent[1].headers.authorization,"Bearer site-relay");assert.equal(sent[1].headers.cookie,undefined);
  await page.evaluate(()=>window.inference.settingsPut({providerSettings:{featherless:{apiKey:{value:{bad:true}}}}}));await start();assert.equal((await result()).code,"invalidStoredProviderCredential");assert.equal(sent.length,2);assert.equal(await dialog.count(),0);
  await page.evaluate(()=>window.inference.settingsPut({}));await start("openrouter/model");assert.equal((await result()).code,"inferenceUnauthorized");assert.equal(await dialog.count(),0);
  await context.setOffline(true);await start();assert.equal((await result()).code,"inferenceOffline");assert.equal(sent.length,2);assert.equal(await dialog.count(),0);await context.setOffline(false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({taggedRoutes:2,exactApproval:true,pendingRouteStable:true,deniedAndCancelledEffects:0,relayAuthorizationAbsent:true,markerCredentialDirect:true,malformedRefused:true,missingOpenRouterRefused:true,offlineRefused:true,pageExceptions:0}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
