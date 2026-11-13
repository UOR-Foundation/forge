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
  const context = await browser.newContext({ serviceWorkers: "block" }), page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(base); await page.waitForFunction(() => !!window.__host && !!window.__prism && !!window.electron);

  const start=mode=>page.evaluate(async mode=>{
    const {buildOnGitHub}=await import(new URL('github-build.js',location.href));
    const {authorizeGitHubPublication,bindPublicationSource}=await import(new URL('github-publication-permission.mjs',location.href));
    const source='blake3:'+'a'.repeat(64),expected={specKappa:source,phase:'proved'};
    window.publicationCurrent=structuredClone(expected);window.publicationSpec={name:'App',title:'App',purpose:'<img src=x onerror="window.__publicationInjected=true">'};window.publicationCalls=[];window.publicationOutcome=null;window.publicationAbort=new AbortController();
    const fetch=async(url,options)=>{
      const endpoint=new URL(url);if(endpoint.origin!=='https://api.github.com')throw Error('unexpected destination');
      window.publicationCalls.push({url:String(url),method:options.method,body:options.body?JSON.parse(options.body):null,credential:options.headers.Authorization==='Bearer fixture-token',redirect:options.redirect,credentials:options.credentials});
      if(endpoint.pathname==='/user')return new Response(JSON.stringify({login:'visitor'}));
      if(options.method==='GET'&&endpoint.pathname.endsWith('/git/ref/heads/main'))return new Response(JSON.stringify({object:{sha:'head'}}));
      if(options.method==='GET')return new Response('{}',{status:404});
      if(mode==='changed-after-write'){window.publicationCurrent.phase='checked';return new Response('{}');}
      return new Response('{}',{status:503});
    };
    buildOnGitHub({token:'fixture-token',source,spec:window.publicationSpec,fetch,signal:window.publicationAbort.signal,authorize:async request=>bindPublicationSource(await authorizeGitHubPublication(request,{signal:window.publicationAbort.signal}),expected,async()=>window.publicationCurrent),templateCommit:()=>{throw Error('unexpected template commit');},open:()=>{throw Error('unexpected artifact');}}).then(value=>window.publicationOutcome={value},error=>window.publicationOutcome={code:error.code});
  },mode);
  const outcome=async()=>{await page.waitForFunction(()=>window.publicationOutcome!==null);return page.evaluate(()=>window.publicationOutcome);};
  const writes=()=>page.evaluate(()=>window.publicationCalls.filter(c=>c.method!=='GET'));
  const dialog=page.getByRole('dialog',{name:'Review public GitHub publication'});
  await start('denied');await dialog.waitFor();assert.equal(await page.evaluate(()=>document.activeElement.textContent),"Don't publish");assert.ok((await dialog.textContent()).includes('visitor/prism-App'));assert.ok(!(await dialog.textContent()).includes('fixture-token'));assert.equal(await dialog.locator('img').count(),0);
  await dialog.getByRole('button',{name:"Don't publish"}).click();assert.equal((await outcome()).code,'publicationPermissionDenied');assert.equal((await writes()).length,0);
  await start('approved');await dialog.waitFor();await page.evaluate(()=>window.publicationSpec.purpose='caller changed');await dialog.getByRole('button',{name:'Publish these rules'}).click();assert.equal((await outcome()).code,'httpRejected');const approved=await writes();assert.equal(approved.length,1);assert.equal(approved[0].body.name,'prism-App');assert.ok(approved[0].body.description.includes('<img'));assert.equal(approved[0].redirect,'error');assert.equal(approved[0].credentials,'omit');assert.equal(approved[0].credential,true);
  await start('stale');await dialog.waitFor();await page.evaluate(()=>window.publicationCurrent.phase='checked');await dialog.getByRole('button',{name:'Publish these rules'}).click();assert.equal((await outcome()).code,'publicationSourceChanged');assert.equal((await writes()).length,0);
  await start('changed-after-write');await dialog.getByRole('button',{name:'Publish these rules'}).click();assert.equal((await outcome()).code,'publicationSourceChanged');assert.equal((await writes()).length,1);
  await start('cancelled');await dialog.waitFor();await page.evaluate(()=>window.publicationAbort.abort());assert.equal((await outcome()).code,'cancelled');assert.equal((await writes()).length,0);
  await context.setOffline(true);await start('offline');assert.equal((await outcome()).code,'publicationPermissionOffline');assert.equal((await writes()).length,0);await context.setOffline(false);
  assert.equal(await page.evaluate(()=>window.__publicationInjected),undefined);assert.deepEqual(errors,[]);console.log(JSON.stringify({nativeDisclosure:true,deniedNoWrites:true,approvedRepository:true,callerSnapshot:true,noMarkupExecution:true,noTokenDisclosure:true,staleBeforeWrite:true,recheckedEveryWrite:true,cancelledNoWrites:true,offlineNoWrites:true,redirectsRefused:true,ambientCredentialsOmitted:true,pageExceptions:0}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
