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
let reply="";
const fixture=name=>{const value=JSON.parse(fs.readFileSync(new URL(`./fixtures/${name==='rsvp'?'live':'specs'}/${name}.json`,import.meta.url),"utf8"));return value.spec??value;};
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ serviceWorkers: "block" }), page = await context.newPage(), errors = [], sent = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console",message=>{if(message.type()==='error'&&!message.text().includes('ERR_FAILED'))console.log('browser diagnostic:',message.text());});
  await context.route("**/*", route => {
    const request=route.request(),url=new URL(request.url());
    if(['https://openrouter.ai/api/v1/chat/completions','https://api.featherless.ai/v1/chat/completions','https://prism-featherless.trinity-03d.workers.dev/v1/chat/completions'].includes(url.href)){
      sent.push(request.postData());return route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({id:'theme-fixture',choices:[{index:0,delta:{content:reply},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'});
    }
    return url.origin===origin?route.continue():route.abort();
  });
  await page.goto(base); await page.waitForFunction(() => !!window.__host && !!window.__prism && !!window.electron);
  const call=(tab,channel,input)=>tab.evaluate(({channel,input})=>window.electron.ipcRenderer.invoke(channel,input),{channel,input});
  const get=(tab,store,key)=>tab.evaluate(({store,key})=>window.__host.get(store,key),{store,key});
  const made=await call(page,'create-app',{name:'readonly-mode',initialChatMode:'build'}),chatId=made.chatId,appId=made.app.id;
  await call(page,'set-user-settings',{selectedModel:{provider:'featherless',name:'zai-org/GLM-5.3-Flash'},providerSettings:{featherless:{apiKey:{value:'readonly-fixture'}}}});
  await page.evaluate(({appId,spec})=>window.__prism.rulesAfterTurn(appId,'<dyad-spec>'+JSON.stringify(spec)+'</dyad-spec>'),{appId,spec:fixture('rsvp')});
  const snapshot=()=>page.evaluate(async appId=>{
    const {captureProjectSource}=await import('./project-edit.mjs'),{db}=await import('./inference.js');
    const source=await captureProjectSource(await db(),appId);
    return {source,rules:await window.__prism.rulesOf(appId),versions:await window.__host.get('versions',appId),preview:await window.__host.get('refs',`preview:${appId}`),run:await window.electron.ipcRenderer.invoke('distributed-machine:subscribe',{protocolVersion:1,machineId:'app_run',encodedKey:{appId}})};
  },appId);
  const before=await snapshot();
  const waitCompletion=async mode=>{
    const deadline=Date.now()+30000;
    while(Date.now()<deadline){const journal=await get(page,'refs',`chat-queue:${chatId}`);const receipt=journal?.receipts.find(r=>r.intentId===mode);if(receipt){assert.equal(journal.state.active,0);return receipt;}await new Promise(resolve=>setTimeout(resolve,20));}
    throw Error('chat completion not committed: '+mode);
  };
  const submit=(mode,prompt)=>page.evaluate(async({mode,prompt,chatId,appId})=>{
    const {bindQueuePayload}=await import('./chat-queue-store.mjs'),{serializeImmutableChatTurnPayload}=await import('./chat-contracts.mjs');
    const intent=await bindQueuePayload({schemaVersion:1,intentId:mode,chatId,appId,invocationRef:{kind:'chat-stream',entityKey:chatId,operationId:mode},prompt,requestedChatMode:mode},serializeImmutableChatTurnPayload);
    return window.electron.ipcRenderer.invoke('distributed-machine:dispatch',{protocolVersion:1,machineId:'chat_stream',encodedKey:{chatId},messageId:crypto.randomUUID(),encodedEvent:{type:'SUBMIT',intent,observedStopPolicyVersion:0}});
  },{mode,prompt,chatId,appId});
  for(const [mode,prompt] of [['ask','approve'],['plan','publish']]){
    reply='READONLY-ANSWER-'+mode+'\n<dyad-spec>'+JSON.stringify(fixture('parking-fee'))+'</dyad-spec>\n'+(mode==='plan'?'<prism-lexlean>malformed repair candidate</prism-lexlean>':'')+'<dyad-spec-patch>[{"op":"replace","path":["title"],"value":"MUTATED"}]</dyad-spec-patch><dyad-write path="evil.txt">NO</dyad-write>';
    const sentBefore=sent.length;
    await submit(mode,prompt);
    const disclosure=page.getByRole('dialog',{name:'Review cloud request',exact:true});await disclosure.waitFor();
    const request=JSON.parse(await disclosure.locator('pre').textContent());assert.ok(request.messages[0].content.includes('Do not modify'));assert.ok(request.messages[0].content.includes(mode));assert.equal(sent.length,sentBefore);assert.deepEqual(await snapshot(),before);
    await page.getByRole('button',{name:'Send this request',exact:true}).click();
    assert.equal((await waitCompletion(mode)).outcome,'completed');
    assert.equal(sent.length,sentBefore+1,'read-only answers must not trigger repair inference');assert.deepEqual(await snapshot(),before,'read-only source proof and preview must be unchanged');
    const chat=await get(page,'chats',chatId),answer=chat.messages.at(-1);assert.ok(answer.content.includes('READONLY-ANSWER-'+mode));assert.ok(answer.content.includes('&lt;dyad-spec&gt;'));assert.ok(!answer.content.includes('<dyad-spec>'));assert.equal(answer.commitHash,null);
    const journal=await get(page,'refs',`chat-queue:${chatId}`);if(!journal.receipts.find(r=>r.intentId===mode))console.log(JSON.stringify({mode,journal}));assert.equal(journal.receipts.find(r=>r.intentId===mode).outcome,'completed');
  }
  reply='<dyad-spec>'+JSON.stringify(fixture('parking-fee'))+'</dyad-spec>';
  await submit('build','Change this application to a parking fee calculator');
  await page.getByRole('dialog',{name:'Review cloud request',exact:true}).waitFor();await page.getByRole('button',{name:'Send this request',exact:true}).click();
  assert.equal((await waitCompletion('build')).outcome,'completed');
  const afterBuild=await snapshot();if(afterBuild.source.reference===before.source.reference)console.log(JSON.stringify({chat:await get(page,'chats',chatId),before,afterBuild}));assert.notEqual(afterBuild.source.reference,before.source.reference,'Build must retain source mutation');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({profile:'foundry/read-only-chat-execution/1',ask:true,plan:true,approvalInert:true,publicationInert:true,sourceUnchanged:true,proofUnchanged:true,previewUnchanged:true,noRepair:true,inertMarkup:true,buildMutates:true,pageErrors:errors}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
