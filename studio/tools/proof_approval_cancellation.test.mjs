import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {assertGenerationActive} from '../shell/generation-patch.mjs';
const host=fs.readFileSync(new URL('../shell/host.js',import.meta.url),'utf8');
const functionOf=name=>{const start=host.indexOf('async function '+name+'('),end=host.indexOf('\n}\n',start)+3;assert.ok(start>=0&&end>start);return host.slice(start,end);};
function turnHarness({cancelAt,submitted=false,showFails=false}={}){
 const controller=new AbortController(),machine={queueSignal:controller.signal,abort:null},log={approvals:0,proofs:0,rollbacks:0,ends:0,phases:[],messages:[]};let phase='checked',shows=0;
 const environment={AbortController,Promise,assertGenerationActive,now:()=> 'now',chatMachineOf:()=>machine,
  approve:async()=>{log.approvals++;phase='proving';if(cancelAt==='approve')controller.abort();return{text:'proving',submitted:()=>submitted,cancel:async()=>{if(submitted)return false;log.rollbacks++;phase='checked';return true;},prove:async()=>{log.proofs++;if(cancelAt==='proof'){submitted=true;controller.abort();return new Promise(()=>{});}return{ok:true};}};},
  saveMessages:async(_id,messages)=>{log.messages.push(messages.at(-1).content);if(++shows===1){if(cancelAt==='show')controller.abort();if(showFails)throw Error('storage failed');}},
  emit:type=>{if(type==='chat:stream:end')log.ends++;},publishChat:(_id,state)=>log.phases.push(state),prism:{proofMessage:()=> 'done'},
 };
 return{run:vm.runInNewContext(functionOf('approveTurn')+';approveTurn',environment),log,controller,machine,get phase(){return phase;}};
}
test('cancellation before remote proof restores its reservation and finalizes the chat',{timeout:2000},async()=>{
 for(const cancelAt of ['approve','show']){const h=turnHarness({cancelAt});await h.run(1,7,[],1,{},'intent');assert.equal(h.phase,'checked');assert.equal(h.log.proofs,0);assert.equal(h.log.rollbacks,1);assert.equal(h.log.ends,1);assert.equal(h.machine.abort,null);}
});
test('stop after remote submission only stops observation and never rolls back proving',{timeout:2000},async()=>{
 const h=turnHarness({cancelAt:'proof'});await h.run(1,7,[],1,{},'intent');assert.equal(h.phase,'proving');assert.equal(h.log.proofs,1);assert.equal(h.log.rollbacks,0);assert.equal(h.log.ends,1);assert.equal(h.machine.abort,null);assert.match(h.log.messages.at(-1),/Stopped watching/);
});
function lifecycleHarness({shape='app',refreshFails=false,libraryFails=false,proofFilesFail=false}={}){
 const original={phase:'checked',sourceKappa:'source-id',specKappa:'spec-id',logicKappa:'logic-id',spec:{rules:[],properties:[]}},log={commits:0,submits:0,refreshes:0};
 let state=structuredClone(original),revision=0,controller=new AbortController(),release,entered;
 const captured=()=>({reference:'revision-'+revision,files:[['prism/App.lex.tex','module']],applicationState:structuredClone(state)});
 const snapshot=()=>({source:'module',captured:captured(),state:structuredClone(state),expectedState:structuredClone(state)});
 const conflict=()=>Object.assign(Error('changed'),{code:'projectEditConflict'});
 const refresh=async()=>{log.refreshes++;if(refreshFails)throw Error('refresh failed');};
 let waiting=false;const observed=new Promise(resolve=>entered=resolve);
 const prover=async(files,options)=>{if(typeof files==='function')await files({});if(waiting){entered();await new Promise(resolve=>release=resolve);}options.beforeSubmit?.();log.submits++;return{ok:true,record:{attestation_id:'attestation'},axioms:{}};};
 const environment={Map,JSON,Promise,AbortController,crypto:{randomUUID:()=> 'unique-attempt'},assertGenerationActive,now:()=> 'now',
  appStateOf:async()=>snapshot(),rulesOf:async()=>structuredClone(state),nextPhase:async(_phase,event)=>event==='approve'?'proving':event==='attest'?'proved':'checked',
  saveAppFiles:async(_app,_writes,source,update)=>{if(source.reference!==captured().reference||JSON.stringify(update.expected)!==JSON.stringify(state))throw conflict();state=structuredClone(update.state);revision++;log.commits++;return{source:captured()};},
  saveRules:async(_app,next,expected)=>{if(JSON.stringify(state)!==JSON.stringify(expected))return false;state=structuredClone(next);log.commits++;return true;},
  refreshApp:refresh,refreshLive:refresh,appLibrary:libraryFails?null:Promise.resolve({}),readEngine:()=>{},
  appShape:{STATE_PATH:'prism/app.json',theoremsOf:()=>[{}],promisesOf:()=>[],provingMessage:()=> 'proving',proofMessage:()=> 'done',withAxioms:value=>value,proofFiles:()=>{if(proofFilesFail)throw Error('local render failed');return{files:[],entrypoints:[]};},checkLibrary:async()=>{throw Error('library failed');}},
  prism:{proveFiles:prover,prove:(_spec,options)=>prover(null,options),provingMessage:()=> 'proving'},put:async()=>{},enc:new TextEncoder(),kappa:async()=> 'source-id',
 };
 const api=vm.runInNewContext(['approveApp','proveApp','approveRules','proveRules'].map(functionOf).join('\n')+';({approveApp,approveRules})',environment);
 return{original,log,controller,observed,wait:()=>{waiting=true;},release:()=>release(),state:()=>structuredClone(state),replace:next=>{state=structuredClone(next);revision++;},approve:()=>shape==='app'?api.approveApp(7,snapshot(),{signal:controller.signal,approvalId:'attempt-one'}):api.approveRules(7,{signal:controller.signal,approvalId:'attempt-one'})};
}
test('stateful and decision cancellation roll back only their exact protected reservation',async()=>{
 for(const shape of ['app','rules']){
  const h=lifecycleHarness({shape}),started=await h.approve();assert.equal(h.state().phase,'proving');h.controller.abort();assert.equal(await started.cancel(),true);assert.deepEqual(h.state(),h.original);assert.equal(h.log.submits,0);assert.equal(await started.cancel(),true);assert.equal(h.log.commits,2);
  const changed=lifecycleHarness({shape}),prior=await changed.approve(),replacement={...changed.state(),approvalId:'other-attempt'};changed.replace(replacement);assert.equal(await prior.cancel(),false);assert.deepEqual(changed.state(),replacement);assert.equal(changed.log.commits,1);
 }
});
test('preview refresh and local library or rendering failures cannot orphan proving state',async()=>{
 for(const shape of ['app','rules']){const h=lifecycleHarness({shape,refreshFails:true});await assert.rejects(h.approve(),/refresh failed/);assert.deepEqual(h.state(),h.original);assert.equal(h.log.submits,0);}
 for(const failure of ['libraryFails','proofFilesFail']){const h=lifecycleHarness({[failure]:true}),started=await h.approve();await assert.rejects(started.prove(),/library failed|local render failed/);assert.deepEqual(h.state(),h.original);assert.equal(h.log.submits,0);}
});
test('cancellation while local proof preparation awaits cannot submit or overwrite a later lifecycle',async()=>{
 for(const shape of ['app','rules']){const h=lifecycleHarness({shape}),started=await h.approve();h.wait();const proof=started.prove();await h.observed;h.controller.abort();await started.cancel();h.release();await assert.rejects(proof,{code:'generationCancelled'});assert.deepEqual(h.state(),h.original);assert.equal(h.log.submits,0);}
});
test('submission consumes rollback authority and proof completion remains source guarded',async()=>{
 for(const shape of ['app','rules']){const h=lifecycleHarness({shape}),started=await h.approve();await started.prove();assert.equal(started.submitted(),true);assert.equal(h.log.submits,1);assert.equal(h.state().phase,'proved');assert.equal(await started.cancel(),false);assert.equal(h.state().phase,'proved');}
});
test('the production prover checks cancellation after local files resolve immediately before its first transfer',async()=>{
 const {proveFiles}=await import('../shell/prism.js');const originalFetch=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;return{status:200,text:async()=>JSON.stringify({result:{isError:true}})};};
 try{
  const controller=new AbortController();await assert.rejects(proveFiles(async()=>{controller.abort();return{files:[],entrypoints:[]};},{beforeSubmit:()=>assertGenerationActive(controller.signal)}),{code:'generationCancelled'});assert.equal(requests,0);
  let admitted=0;await proveFiles(async()=>({files:[],entrypoints:[]}),{beforeSubmit:()=>admitted++});assert.equal(admitted,1);assert.equal(requests,1);
 }finally{globalThis.fetch=originalFetch;}
 const source=fs.readFileSync(new URL('../shell/prism.js',import.meta.url),'utf8'),start=source.indexOf('export async function proveFiles('),end=source.indexOf('\n}\n',start)+3;
 const run=source.slice(start,end).replace('export ','');assert.ok(run.includes('if (!submitted) { beforeSubmit(); submitted = true; }'));
 const mutant=vm.runInNewContext(run.replace('beforeSubmit(); submitted = true;','submitted = true;')+';proveFiles',{callTool:async()=>({isError:true})});
 await assert.rejects(async()=>{await assert.rejects(mutant(async()=>({files:[],entrypoints:[]}),{beforeSubmit:()=>{throw Object.assign(Error('cancelled'),{code:'generationCancelled'});}}),{code:'generationCancelled'});},{name:'AssertionError'});
});
