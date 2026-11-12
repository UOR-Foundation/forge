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
  const made=await call(page,'create-app',{name:'picker-scope',initialChatMode:'build'}),other=await call(page,'create-app',{name:'other-picker-chat',initialChatMode:'build'});
  const globalModel={provider:'openrouter',name:'moonshotai/kimi-k2.5'},cloud={provider:'featherless',name:'zai-org/GLM-5.3-Flash',effortLevel:'medium'};
  await call(page,'set-user-settings',{selectedModel:globalModel});await call(page,'update-chat',{chatId:made.chatId,modelSelection:cloud});await call(page,'update-chat',{chatId:other.chatId,modelSelection:cloud});
  const openChat=async()=>{
    await page.goto(base+'chat?id='+made.chatId+'&appId='+made.app.id);await page.waitForFunction(()=>!!window.__host&&!!window.electron);
    const preview=page.getByRole('dialog',{name:'Review preview permissions',exact:true});try{await preview.waitFor({timeout:3000});await preview.getByRole('button',{name:"Don't allow",exact:true}).click();}catch(error){if(error.name!=='TimeoutError')throw error;}
    await page.getByTestId('model-picker').waitFor();
  };
  const choose=async label=>{await page.getByTestId('model-picker').click();await page.getByRole('menuitem',{name:new RegExp(label)}).click();};
  const waitModel=async(chatId,provider)=>{const deadline=Date.now()+10000;while(Date.now()<deadline){const row=await get(page,'chats',chatId);if(row.modelSelection?.provider===provider)return row;await new Promise(r=>setTimeout(r,20));}throw Error('chat model did not commit');};
  await openChat();assert.ok((await page.getByTestId('model-picker').textContent()).includes('GLM 5.3 Flash'),'mounted chat picker must show its committed model');
  await choose('BitNet 2B');const changed=await waitModel(made.chatId,'local');assert.equal(changed.messages.length,0,'empty chat must persist selection');assert.deepEqual((await get(page,'settings','user')).selectedModel,globalModel);assert.deepEqual((await get(page,'chats',other.chatId)).modelSelection,cloud);
  await page.goto(base);await page.getByTestId('model-picker').waitFor();await choose('GLM 5.3 Flash');
  const deadline=Date.now()+10000;while((await get(page,'settings','user')).selectedModel.provider!=='featherless'){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,20));}
  await openChat();assert.ok((await page.getByTestId('model-picker').textContent()).includes('BitNet 2B'));assert.equal((await get(page,'chats',made.chatId)).modelSelection.provider,'local');
  await choose('GLM 5.3 Flash');await waitModel(made.chatId,'featherless');await page.reload();await page.getByTestId('model-picker').waitFor();assert.ok((await page.getByTestId('model-picker').textContent()).includes('GLM 5.3 Flash'));
  assert.equal(sent.length,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({profile:'foundry/chat-model-picker-scope/1',mountedChatLabel:true,emptyChatPersistence:true,homeDefaultIndependent:true,otherChatUnchanged:true,reload:true,pageErrors:errors}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
