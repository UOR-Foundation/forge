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
  const made=await page.evaluate(async()=>{
    const call=(channel,input)=>window.electron.ipcRenderer.invoke(channel,input);
    const made=await call('create-app',{name:'durable-queue',initialChatMode:'build'});
    const send=event=>call('distributed-machine:dispatch',{protocolVersion:1,machineId:'chat_stream',encodedKey:{chatId:made.chatId},messageId:crypto.randomUUID(),encodedEvent:event});
    await send({type:'PAUSE_QUEUE',expectedQueueRevision:0,mutationId:'pause'});
    const {bindQueuePayload}=await import('./chat-queue-store.mjs'),{serializeImmutableChatTurnPayload}=await import('./chat-contracts.mjs');
    for(let n=1;n<=3;n++){
      const intent=await bindQueuePayload({schemaVersion:1,intentId:`intent-${n}`,chatId:made.chatId,appId:made.app.id,invocationRef:{kind:'chat-stream',entityKey:made.chatId,operationId:`op-${n}`},prompt:`Queued ${n}`,requestedChatMode:'build'},serializeImmutableChatTurnPayload);
      await send({type:'SUBMIT',intent,observedStopPolicyVersion:0});
    }
    const snapshot=await call('distributed-machine:subscribe',{protocolVersion:1,machineId:'chat_stream',encodedKey:{chatId:made.chatId}});
    if(snapshot.encodedState.queue.length!==3||!snapshot.encodedState.queuePaused)throw Error('durable paused queue missing');
    return {...made,actor:snapshot.actorInstanceId};
  });
  const peer=await context.newPage();await peer.goto(base);await peer.waitForFunction(()=>!!window.__host&&!!window.electron);
  const first=await peer.evaluate(async made=>window.electron.ipcRenderer.invoke('distributed-machine:subscribe',{protocolVersion:1,machineId:'chat_stream',encodedKey:{chatId:made.chatId}}),made);
  assert.equal(first.encodedState.queue.length,3);assert.equal(first.encodedState.queueRevision,4);
  const edited=await peer.evaluate(async made=>{
    const call=(channel,input)=>window.electron.ipcRenderer.invoke(channel,input),send=event=>call('distributed-machine:dispatch',{protocolVersion:1,machineId:'chat_stream',encodedKey:{chatId:made.chatId},messageId:crypto.randomUUID(),encodedEvent:event});
    await send({type:'EDIT_QUEUE_ENTRY',itemId:'queue-2',prompt:'Edited in peer',expectedQueueRevision:4,mutationId:'edit'});
    await send({type:'REORDER_QUEUE_ENTRY',itemId:'queue-3',toIndex:0,expectedQueueRevision:5,mutationId:'reorder'});
    await send({type:'REMOVE_QUEUE_ENTRY',itemId:'queue-1',expectedQueueRevision:6,mutationId:'remove'});
    let stale=false;try{await send({type:'CLEAR_QUEUE',expectedQueueRevision:4,mutationId:'stale'});}catch{stale=true;}
    if(!stale)throw Error('stale queue mutation acknowledged');
    return await window.__host.get('refs',`chat-queue:${made.chatId}`);
  },made);
  assert.deepEqual(edited.entries.map(e=>e.intent.prompt),['Queued 3','Edited in peer']);assert.equal(edited.state.revision,7);
  await page.reload();await page.waitForFunction(()=>!!window.__host&&!!window.electron);
  const reloaded=await page.evaluate(async made=>window.electron.ipcRenderer.invoke('distributed-machine:subscribe',{protocolVersion:1,machineId:'chat_stream',encodedKey:{chatId:made.chatId}}),made);
  assert.notEqual(reloaded.actorInstanceId,made.actor);assert.deepEqual(reloaded.encodedState.queue.map(e=>e.prompt),['Queued 3','Edited in peer']);assert.equal(reloaded.encodedState.queuePaused,true);
  await page.evaluate(async made=>{
    const call=(channel,input)=>window.electron.ipcRenderer.invoke(channel,input);
    const stale=await call('distributed-machine:dispatch',{protocolVersion:1,machineId:'chat_stream',encodedKey:{chatId:made.chatId},messageId:'old-actor',expectedActorInstanceId:made.actor,encodedEvent:{type:'CLEAR_QUEUE',expectedQueueRevision:7,mutationId:'old'}});
    if(stale.kind!=='rejected'||stale.reason!=='stale-actor')throw Error('obsolete actor changed queue');
    await call('distributed-machine:dispatch',{protocolVersion:1,machineId:'chat_stream',encodedKey:{chatId:made.chatId},messageId:'clear',encodedEvent:{type:'CLEAR_QUEUE',expectedQueueRevision:7,mutationId:'clear'}});
    const j=await window.__host.get('refs',`chat-queue:${made.chatId}`);if(j.entries.length||j.state.revision!==8)throw Error('clear failed');
    await call('delete-chat',made.chatId);if(await window.__host.get('refs',`chat-queue:${made.chatId}`)!==undefined)throw Error('deleted chat retained queue');
  },made);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({actualHost:true,actualGuest:true,tabs:2,persistedPrompts:3,edit:true,reorder:true,remove:true,staleRevisionRefused:true,reload:true,staleActorRefused:true,clear:true,delete:true,pageExceptions:0}));

}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
