import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {interactionPreset,readInteractionDocument,interactionModule,interactionDocumentFromFiles,validateInteractionDocument} from '../shell/interaction-application.mjs';
import {createInteractionAudio} from '../shell/interaction-ui.mjs';
import {assertCanonicalGeneration} from '../shell/canonical-generation.mjs';
import {stageInteraction} from '../shell/interaction-state.mjs';
const enc=new TextEncoder(),id='blake3:'+'a'.repeat(64),derive=async()=>id;
const reply=output=>enc.encode('ok '+output.map(n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return Buffer.from(b).toString('hex');}).join(''));
const command={event:0,audioGranted:false,reducedMotion:true,reset:false};
const fixture=()=>interactionPreset('garden');
test('gallery and garden documents reconstruct literal canonical model authority',()=>{
 for(const kind of ['gallery','garden']){const d=interactionPreset(kind),raw=JSON.stringify(d),source=interactionModule(d.graph);assert.deepEqual(readInteractionDocument(raw),d);assert.deepEqual(interactionDocumentFromFiles([['prism/interaction.json',raw],['prism/Application.lex.tex',source]]),d);assert.match(source,/record InteractionModel::InteractionProfile/);assert.throws(()=>interactionDocumentFromFiles([['prism/interaction.json',raw],['prism/Application.lex.tex',source],['prism/InteractionModel.lex.tex','changed']], 'accepted'),{code:'interactionApplicationMismatch'});assert.throws(()=>interactionDocumentFromFiles([['prism/interaction.json',raw],['prism/Application.lex.tex',source+' ']]),{code:'interactionApplicationMismatch'});}
});
test('unbounded malformed or executable presentation data refuse',()=>{
 for(const path of ['prism/interaction.json','prism/Application.lex.tex','prism/InteractionModel.lex.tex'])assert.throws(()=>assertCanonicalGeneration({files:[['prism/interaction.json','{}']]},{writes:[{path,content:'changed'}],deletes:[],renames:[],deps:[]},{}),{code:'canonicalGenerationRefused'});
 const mutations=[d=>d.title='',d=>d.extra=true,d=>d.screens[0].illustration='<script>',d=>d.controls.push(d.controls[0]),d=>d.controls=[],d=>d.screens[0].description='a'.repeat(2001),d=>d.graph.frames=Array(33).fill(d.graph.frames[0])];
 for(const change of mutations){const d=fixture();change(d);assert.throws(()=>readInteractionDocument(JSON.stringify(d)),{code:'invalidInteractionApplication'});}for(const raw of [null,'{}','x'.repeat(65537)])assert.throws(()=>readInteractionDocument(raw),{code:'invalidInteractionApplication'});
});
test('application admission and transition always execute the generated guest',async()=>{
 let calls=0;const guest={dispatch:async bytes=>{calls++;assert.match(new TextDecoder().decode(bytes),/^interact /);return reply([1,1,3,0,0]);}};
 await validateInteractionDocument(JSON.stringify(fixture()),guest);const result=await stageInteraction(guest,derive,fixture(),undefined,{...command,event:1});assert.equal(calls,2);assert.deepEqual(result.output,{state:1,screen:1,palette:3,tone:0,motion:0});assert.equal(result.state.model,id);assert.equal(result.state.state,1);
 await assert.rejects(stageInteraction({dispatch:async()=>enc.encode('unknownInteractionEvent')},derive,fixture(),result.state,{...command,event:4}),{code:'unknownInteractionEvent'});
});
test('stored semantic identity requires explicit reset after changed models',async()=>{
 let calls=0;const guest={dispatch:async()=>{calls++;return reply([0,0,2,0,0]);}},old={profile:'foundry/interaction-state/1',model:'blake3:'+'b'.repeat(64),state:1,revision:1};
 await assert.rejects(stageInteraction(guest,derive,fixture(),old,command),{code:'interactionStateStale'});assert.equal(calls,0);
 const restored=await stageInteraction(guest,derive,fixture(),old,{...command,reset:true});assert.equal(restored.state.state,0);assert.equal(restored.state.model,id);
 await assert.rejects(stageInteraction(guest,derive,fixture(),old,{...command,reset:true,event:1}),{code:'invalidInteractionApplication'});
});
test('mutable commands and graph cannot change an already captured interaction',async()=>{
 let release;const waiting=new Promise(r=>release=r),d=fixture(),action={...command},seen=[];
 const result=stageInteraction({dispatch:async b=>{seen.push(Buffer.from(b).toString());return reply([0,0,2,0,0]);}},async()=>{await waiting;return id;},d,undefined,action);d.graph.initial=1;action.event=1;release();await result;assert.equal(seen.length,1);assert.match(seen[0],/00000000000000000000000001000000$/);
 let resume;const resumed=new Promise(r=>resume=r),audio=createInteractionAudio(()=>({resume:()=>resumed,state:'running',close:async()=>{}}));const enabling=audio.enable();audio.revoke();resume();await enabling;assert.equal(audio.granted,false,'late audio resume renewed revoked consent');
 const unavailable=createInteractionAudio(()=>{throw Error('private device detail');});await assert.rejects(unavailable.enable(),error=>error.code==='interactionAudioUnavailable'&&!error.message.includes('private'));assert.equal(unavailable.granted,false);

});
test('storage and host route enforce comparison deletion ownership and private errors',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
 for(const token of ['interactionRead','JSON.stringify(currentInteraction) !== JSON.stringify(interaction.expected)','interaction.state, `interaction:${appId}`'])assert.ok(read('../shell/project-edit.mjs').includes(token),token);
 assert.ok(read('../shell/project-lifecycle.mjs').includes('refs.delete(`interaction:${appId}`)'));
 assert.ok(read('../shell/canonical-generation.mjs').includes('prism/interaction.json'));
 for(const name of ['forge:interaction-create','forge:interaction-run','mountInteractionApplications'])assert.ok(read('../shell/host.js').includes(name),name);
 assert.ok(read('../shell/host-boundary.mjs').includes('interactionStateStale'));
});
