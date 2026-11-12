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
  page.on("pageerror", error => errors.push(error.message));
  page.on("console",message=>{if(message.type()==='error'&&!message.text().includes('ERR_FAILED'))console.log('browser diagnostic:',message.text());});
  await context.route("**/*", route => {
    const request=route.request(),url=new URL(request.url());
    if(['https://openrouter.ai/api/v1/chat/completions','https://api.featherless.ai/v1/chat/completions','https://prism-featherless.trinity-03d.workers.dev/v1/chat/completions'].includes(url.href)){
      sent.push(request.postData());return route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({id:'theme-fixture',choices:[{index:0,delta:{content:'THEME-GENERATION-COMPLETE'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(base); await page.waitForFunction(() => !!window.__host && !!window.__prism && !!window.electron);
  const call=(tab,channel,input)=>tab.evaluate(({channel,input})=>window.electron.ipcRenderer.invoke(channel,input),{channel,input});
  const get=(tab,store,key)=>tab.evaluate(({store,key})=>window.__host.get(store,key),{store,key});
  const created=await call(page,'create-app',{name:'preferences',initialChatMode:'build'}),chatId=created.chatId;
  const peer=await context.newPage();await peer.goto(base);await peer.waitForFunction(()=>!!window.__host&&!!window.electron);
  const modelSelection={provider:'featherless',name:'zai-org/GLM-5.3-Flash',effortLevel:'medium'};
  await call(page,'set-user-settings',{selectedModel:{provider:'openrouter',name:'moonshotai/kimi-k2.5'}});
  await Promise.all([call(page,'update-chat',{chatId,title:'',chatMode:'ask'}),call(peer,'update-chat',{chatId,modelSelection})]);
  const row=await get(page,'chats',chatId);assert.equal(row.title,'');assert.equal(row.chatMode,'ask');assert.deepEqual(row.modelSelection,modelSelection);
  await Promise.all([call(page,'update-chat',{chatId,title:'Concurrent'}),peer.evaluate(async chatId=>{
    const {updateStoredChat}=await import('./project-lifecycle.mjs');const {db:open}=await import('./inference.js');
    const db=await open();
    await updateStoredChat(db,chatId,{messages:[{id:1,role:'user',content:'preserved transcript',approvalState:null,commitHash:null,createdAt:new Date().toISOString()}]});
  },chatId)]);
  await page.reload();await page.waitForFunction(()=>!!window.__host&&!!window.electron);
  const reloaded=await get(page,'chats',chatId);assert.equal(reloaded.title,'Concurrent');assert.equal(reloaded.messages[0].content,'preserved transcript');assert.deepEqual(reloaded.modelSelection,modelSelection);
  assert.equal((await call(page,'chat:count-tokens',{chatId,input:'hello'})).contextWindow,262144);
  const late=await page.evaluate(async chatId=>{
    const put=IDBObjectStore.prototype.put;let injected=false;
    IDBObjectStore.prototype.put=function(value,key){const request=put.call(this,value,key);if(this.name==='chats'){injected=true;request.addEventListener('success',()=>this.transaction.abort(),{once:true});}return request;};
    try{await window.electron.ipcRenderer.invoke('update-chat',{chatId,title:'Must not commit'});return {injected,code:null};}catch(e){return {injected,code:e.code};}finally{IDBObjectStore.prototype.put=put;}
  },chatId);assert.deepEqual(late,{injected:true,code:'chatPreferencesStorageFailed'});assert.deepEqual(await get(peer,'chats',chatId),reloaded);
  await call(page,'set-user-settings',{providerSettings:{featherless:{apiKey:{value:'preferences-local-fixture'}}}});
  await call(page,'update-chat',{chatId,chatMode:'build'});
  await page.goto(base+'chat?id='+chatId+'&appId='+created.app.id);await page.waitForFunction(()=>!!window.electron);
  await page.getByTestId('chat-input-container').getByRole('textbox').fill('Describe a useful small application');
  await page.getByTestId('chat-input-container').getByRole('textbox').press('Enter');
  const disclosure=page.getByRole('dialog',{name:'Review cloud request',exact:true});
  for(let i=0;i<8;i++){
    try{await page.waitForFunction(()=>!!document.querySelector('dialog[open]'),null,{timeout:30000});}catch(error){if(await page.getByText('Show details',{exact:true}).count())await page.getByText('Show details',{exact:true}).click();console.log(await page.locator('body').innerText());console.log(await call(page,'get-chat',chatId));throw error;}
    if(await disclosure.count())break;
    await page.getByRole('dialog',{name:'Review preview permissions',exact:true}).getByRole('button',{name:"Don't allow",exact:true}).click();
  }
  await disclosure.waitFor();assert.equal(JSON.parse(await disclosure.locator('pre').textContent()).model,modelSelection.name);
  assert.equal(sent.length,0);await page.getByRole('button',{name:'Send this request',exact:true}).click();
  await page.waitForFunction(()=>!!document.body.textContent.includes('THEME-GENERATION-COMPLETE'));
  assert.equal(sent.length,1);assert.equal(JSON.parse(sent[0]).model,modelSelection.name);
  await call(peer,'delete-chat',chatId);
  const missing=await page.evaluate(async chatId=>{try{await window.electron.ipcRenderer.invoke('update-chat',{chatId,title:'revived'});}catch(e){return e.code;}},chatId);
  assert.equal(missing,'chatPreferencesMissing');assert.equal(await get(page,'chats',chatId),undefined);
  assert.equal(sent.length,1);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({profile:'foundry/atomic-chat-preferences/1',concurrentPreferences:true,concurrentTranscript:true,reload:true,selectedModelMeter:true,selectedModelRequest:true,lateAbort:true,noRevival:true,pageErrors:errors}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
