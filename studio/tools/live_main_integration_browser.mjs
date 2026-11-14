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
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/specs/parking-fee.json',import.meta.url),'utf8')).spec;
const {SPEC_RULES,SPEC_EXAMPLE,MODULE_EXAMPLE,specContext}=await import('../shell/prism.js');
const draft=MODULE_EXAMPLE;
const answer='Here is the updated application.\n<dyad-spec>'+SPEC_EXAMPLE+'</dyad-spec>\n<prism-lexlean>'+draft.replace('ParkingFee','IntruderModule')+'</prism-lexlean>\n<dyad-write path="intruder.txt" description="ignored">UNTRUSTED_GENERATED_CODE</dyad-write>\n<dyad-spec-patch>[null,{"op":"set","path":["purpose"],"value":"A checked purpose from the accepted operation"}]</dyad-spec-patch>\nThe update is ready.';
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ serviceWorkers: "allow" }), page = await context.newPage(), errors = [], sent = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console",message=>{if(message.type()==='error'&&!message.text().includes('ERR_FAILED'))console.log('browser diagnostic:',message.text());});
  await context.route("**/*", route => {
    const request=route.request(),url=new URL(request.url());
    if(['https://api.featherless.ai/v1/chat/completions','https://prism-featherless.trinity-03d.workers.dev/v1/chat/completions'].includes(url.href)){
      sent.push(request.postData());return route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({id:'theme-fixture',choices:[{index:0,delta:{content:answer},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(base); await page.waitForFunction(() => !!navigator.serviceWorker.controller && !!window.__host && !!window.__prism && !!window.electron);
  const call=(channel,input)=>page.evaluate(({channel,input})=>window.electron.ipcRenderer.invoke(channel,input),{channel,input});
  const made=await call('create-app',{name:'canonical-generation-integration',initialChatMode:'build'}),appId=made.app.id;
  await page.evaluate(({appId,fixture})=>window.__prism.rulesAfterTurn(appId,'<dyad-spec>'+JSON.stringify(fixture)+'</dyad-spec>'),{appId,fixture});
  await call('edit-app-file',{appId,filePath:'notes.txt',content:'PRIVATE-IMPLEMENTATION-FIXTURE'});
  const theme=await call('create-custom-theme',{name:'Generation fixture',prompt:'THEME-CAPTURED-BEFORE-APPROVAL'});await call('set-app-theme',{appId,themeId:'custom:'+theme.id});
  await call('set-user-settings',{selectedModel:{provider:'featherless',name:'Qwen/Qwen3-30B-A3B-Instruct-2507'},providerSettings:{featherless:{apiKey:{value:'integration-local-fixture'}}}});
  const moduleOf=()=>page.evaluate(async({base,appId})=>{const {captureProjectSource}=await import(base+'project-edit.mjs'),inference=await import(base+'inference.js');const source=await captureProjectSource(await inference.db(),appId);return source.files.find(([p])=>/^prism\/[A-Z]\w*\.lex\.tex$/.test(p))[1];},{base,appId});
  const specOf=()=>page.evaluate(appId=>window.__host.get('files',appId+':prism/spec.json'),appId);
  const before=await specOf();
  await page.goto(base+'chat?id='+made.chatId+'&appId='+appId);await page.waitForFunction(()=>!!window.electron);await page.getByTestId('chat-input-container').getByRole('textbox').fill('Revise the canonical module and its purpose.');await page.getByTestId('chat-input-container').getByRole('textbox').press('Enter');
  const disclosure=page.getByRole('dialog',{name:'Review cloud request',exact:true});
  for(let i=0;i<8;i++){
    try{await page.waitForFunction(()=>!!document.querySelector('dialog[open]'),null,{timeout:20000});}catch(error){console.log(await page.locator('body').innerText());console.log(await call('get-chat',made.chatId));console.log(errors);throw error;}
    if(await disclosure.count())break;
    await page.getByRole('dialog',{name:'Review preview permissions',exact:true}).getByRole('button',{name:"Don't allow",exact:true}).click();
  }
  await disclosure.waitFor();const disclosed=await disclosure.locator('pre').textContent(),request=JSON.parse(disclosed);
  assert.equal(request.messages[0].content,SPEC_RULES+'\n\nTHEME-CAPTURED-BEFORE-APPROVAL');assert.equal(request.messages[1].content,specContext(before));assert.ok(!disclosed.includes('\\begin{lexlean}'));assert.ok(!disclosed.includes('PRIVATE-IMPLEMENTATION-FIXTURE'));assert.equal(sent.length,0);
  await call('update-custom-theme',{id:theme.id,prompt:'THEME-CHANGED-AFTER-DISCLOSURE'});assert.equal(await disclosure.locator('pre').textContent(),disclosed);
  await disclosure.getByRole('button',{name:'Send this request',exact:true}).click();
  let chat;
  for(let attempt=0;attempt<300;attempt++){
    chat=await call('get-chat',made.chatId);
    if(chat.messages.at(-1)?.requestId)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(chat.messages.at(-1)?.requestId,'completed response receipt was not persisted');
  const last=chat.messages.at(-1).content;
  assert.ok(last.includes('Code not applied')&&last.includes('LexLean not applied')&&last.includes('Patch refused')&&last.includes('The update is ready.'),last);assert.ok(!last.includes('definition{')&&!last.includes('\\begin{lexlean}'));
  assert.deepEqual(sent,[disclosed]);
  const state=await page.evaluate(async appId=>({spec:JSON.parse(await window.__host.get('files',appId+':prism/spec.json')),intruder:await window.__host.get('files',appId+':intruder.txt'),notes:await window.__host.get('files',appId+':notes.txt')}),appId);
  assert.equal(state.spec.purpose,'A checked purpose from the accepted operation');assert.equal(state.intruder,undefined);assert.equal(state.notes,'PRIVATE-IMPLEMENTATION-FIXTURE');
  assert.equal(state.spec.title,JSON.parse(SPEC_EXAMPLE).title);assert.ok(!(await moduleOf()).includes('IntruderModule'));
  const next=await specOf(),meter=await call('chat:count-tokens',{chatId:made.chatId,input:'next'});
  assert.equal(meter.codebaseTokens,Math.ceil(specContext(next).length/4));assert.equal(meter.systemPromptTokens,Math.ceil((SPEC_RULES+'\n\nTHEME-CHANGED-AFTER-DISCLOSURE').length/4));assert.equal(meter.messageHistoryTokens,chat.messages.reduce((n,m)=>n+Math.ceil((m.content||'').length/4),0));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({actualRenderer:true,canonicalDraft:true,exactThemeConsent:true,implementationSourceExcluded:true,modelWrittenCodeApplied:0,partialPatchRefused:true,acceptedPatchStored:true,moduleHiddenFromChat:true,contextMeter:true,pageExceptions:0}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
