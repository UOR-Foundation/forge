import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';
const source=fs.readFileSync(new URL('../shell/kernel.js',import.meta.url),'utf8'),originalMeta=JSON.parse(fs.readFileSync(new URL('../shell/kernel/kernel.json',import.meta.url))),bytes=fs.readFileSync(new URL('../shell/kernel/guest.wasm',import.meta.url));
function fixture(){const urls=new Map(),timers=new Map(),workers=[];let serial=0,instances=0,hang=false,malformed=false,startup=false;
 const wasm={...WebAssembly,compile:WebAssembly.compile,Module:WebAssembly.Module,instantiate:async(...args)=>{instances++;return WebAssembly.instantiate(...args);}};
 class Blob {constructor(parts){this.text=parts.join('');}}
 class Worker {constructor(url){if(startup)throw Error('worker unavailable');this.terminated=false;this.calls=0;workers.push(this);const self={postMessage:data=>queueMicrotask(()=>{if(!this.terminated)this.onmessage?.({data:malformed?{...data,id:-1}:data});})};vm.runInNewContext(urls.get(url),{self,WebAssembly:wasm,Uint8Array,Error,BigInt});this.scope=self;}
  postMessage(data){this.calls++;if(hang)return;queueMicrotask(()=>{if(!this.terminated)this.scope.onmessage({data});});}
  terminate(){this.terminated=true;this.scope=null;}
 }
 let bridge;const controller={};const self={navigator:{serviceWorker:{controller,addEventListener:(_,fn)=>bridge=fn}}};vm.runInNewContext(source,{self,Worker,Blob,location:{href:'https://example.test/'},URL:{createObjectURL:blob=>{const id='blob:'+ ++serial;urls.set(id,blob.text);return id;},revokeObjectURL:id=>urls.delete(id)},crypto:webcrypto,WebAssembly:wasm,TextEncoder,TextDecoder,Uint8Array,atob,Promise,setTimeout:fn=>{const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const meta=structuredClone(originalMeta);meta.vectors=[meta.vectors[0]];const get=async path=>path.endsWith('.json')?{ok:true,json:async()=>meta}:{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 return {load:()=>self.ForgeKernel.load(get),get,controller,bridge:(data,ports,source=controller)=>bridge({data,ports,source}),workers,urls,timers,get instances(){return instances;},set hang(x){hang=x;},set malformed(x){malformed=x;},set startup(x){startup=x;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function service(clients){
 const durations=[],timers=new Set(),ports=[];
 class TrackedChannel {constructor(){const c=new MessageChannel();for(const p of [c.port1,c.port2]){const close=p.close.bind(p);p.closed=false;p.close=()=>{p.closed=true;close();};ports.push(p);}this.port1=c.port1;this.port2=c.port2;}}
 const self={clients:{matchAll:async options=>{assert.equal(options.includeUncontrolled,false);return clients();}}};
 vm.runInNewContext(source,{self,location:{},MessageChannel:TrackedChannel,crypto:webcrypto,WebAssembly:{...WebAssembly,Module:WebAssembly.Module,compile:WebAssembly.compile,instantiate:()=>assert.fail('service worker cannot instantiate')},TextEncoder,TextDecoder,Uint8Array,atob,setTimeout:(fn,ms)=>{durations.push(ms);const t=setTimeout(()=>{timers.delete(t);fn();},ms===30000?150:1);timers.add(t);return t;},clearTimeout:t=>{timers.delete(t);clearTimeout(t);}});
 return {load:get=>self.ForgeKernel.load(get),durations,timers,ports};
}
test('lost document is replaced without resetting deadline or bypassing exact guest replay',async()=>{
 const doc=fixture();await doc.load();let current;const requests=[];
 const replacement={id:'new-document',postMessage:(data,ports)=>{requests.push(data);void doc.bridge(data,ports);}};
 current={id:'old-document',postMessage:()=>{current=replacement;}};
 const sw=service(()=>[current]),kernel=await sw.load(doc.get);
 assert.equal(await kernel.ask('drafting check'),'checked');assert.equal(doc.instances,3);
 assert.equal(requests.length,2);assert.ok(requests.every(x=>x.key===originalMeta.digest+':'+originalMeta.guest.sha256));
 assert.equal(sw.durations.filter(x=>x===30000).length,2);assert.ok(sw.durations.includes(50));assert.equal(sw.timers.size,0);assert.ok(sw.ports.every(p=>p.closed));
});
test('a vanished owner without replacement expires once and closes all resources',async()=>{
 const doc=fixture();await doc.load();let current={id:'gone',postMessage:()=>{current=null;}};
 const sw=service(()=>current?[current]:[]);await assert.rejects(()=>sw.load(doc.get),{code:'kernelAcceptanceFailed'});
 assert.equal(sw.durations.filter(x=>x===30000).length,1);assert.equal(sw.timers.size,0);assert.ok(sw.ports.every(p=>p.closed));assert.equal(doc.instances,1);
});
test('document churn is bounded to eight batches and wrong replacement cannot execute',async()=>{
 const doc=fixture();await doc.load();let serial=0,calls=0;
 const next=()=>({id:'owner-'+serial,postMessage:()=>{calls++;serial++;}});
 const sw=service(()=>[next()]);await assert.rejects(()=>sw.load(doc.get),{code:'kernelAcceptanceFailed'});
 assert.equal(calls,8);assert.equal(sw.durations.filter(x=>x===30000).length,1);assert.equal(sw.timers.size,0);assert.ok(sw.ports.every(p=>p.closed));
 let current={id:'old',postMessage:()=>{current={id:'wrong',postMessage:(data,ports)=>void doc.bridge({...data,key:'wrong-identity'},ports)};}};
 const wrong=service(()=>[current]);await assert.rejects(()=>wrong.load(doc.get),{code:'kernelAcceptanceFailed'});assert.equal(doc.instances,1);assert.ok(wrong.ports.every(p=>p.closed));assert.equal(wrong.timers.size,0);
});
test('live unanswered owners are not replaced and the actual navigation gate is mandatory',async()=>{
 const doc=fixture();await doc.load();let calls=0;const live={id:'still-live',postMessage:()=>{calls++;}};
 const sw=service(()=>[live]);await assert.rejects(()=>sw.load(doc.get),{code:'kernelAcceptanceFailed'});assert.equal(calls,1);assert.equal(sw.timers.size,0);assert.ok(sw.ports.every(p=>p.closed));
 assert.match(fs.readFileSync(new URL('../../app/src/FoundrySpecification.lex.tex',import.meta.url),'utf8'),/name: kernelOwnerHandoffBoundary/);
 assert.ok(fs.readFileSync(new URL('../../.github/workflows/studio.yml',import.meta.url),'utf8').includes('node tools/kernel_owner_handoff_browser.mjs'));
});
