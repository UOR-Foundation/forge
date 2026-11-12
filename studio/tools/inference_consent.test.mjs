import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { describeInference, authorizeInference as authorize } from "../shell/inference-consent.mjs";
import { cloudCompletion } from "../shell/inference-effects.mjs";
const authorizeInference = (input, options = {}) => authorize(input, { timeoutMs: 100, ...options });
const request = { provider: 'openrouter', model: 'model', bytes: '{"messages":[{"content":"<script>private payload</script>"}]}', credentialOwner: 'visitor' };
const code = c => e => e.code === c;
function dom() {
  const nodes=[];
  class Element extends EventTarget {
    constructor(tag){super();this.tag=tag;this.style={};this.children=[];nodes.push(this);}
    append(...children){this.children.push(...children);}
    setAttribute(){}
    remove(){this.removed=true;}
    showModal(){this.open=true;}
    focus(){doc.activeElement=this;}
    click(){this.dispatchEvent(new Event('click'));}
  }
  const doc={createElement:tag=>new Element(tag),body:new Element('body'),activeElement:{focus(){}}};
  return {document:doc,nodes,button:label=>nodes.find(n=>n.tag==='button'&&n.textContent===label)};
}
test('disclosure snapshots exact bounded JSON and endpoint without executing markup',()=>{
  for(const value of [null,undefined,[],"request"])assert.throws(()=>describeInference(value),code("invalidInferenceConsent"));
  const input={...request};const d=describeInference(input);input.bytes='{}';assert.equal(d.bytes,request.bytes);assert.ok(Object.isFrozen(d));assert.equal(d.endpoint,'https://openrouter.ai/api/v1/chat/completions');assert.equal(d.size,new TextEncoder().encode(request.bytes).length);
  for(const patch of [{provider:'unknown'},{model:''},{model:'m'.repeat(257)},{bytes:'not json'},{bytes:'[]'},{bytes:'x'.repeat(2097153)},{credentialOwner:'unknown'}])assert.throws(()=>describeInference({...request,...patch}),code('invalidInferenceConsent'));
});
test('offline cancellation and invalid deadlines refuse before creating UI',async()=>{
  const document={createElement(){assert.fail('must not create a dialog');}};
  await assert.rejects(authorizeInference(request,{document,online:()=>false}),code('inferenceOffline'));
  const controller=new AbortController();controller.abort();await assert.rejects(authorizeInference({...request,signal:controller.signal},{document,online:()=>true}),code('inferenceConsentCancelled'));
  for(const timeoutMs of [0,300001,NaN])await assert.rejects(authorizeInference(request,{document,online:()=>true,timeoutMs}),code('invalidInferenceConsent'));
});
test('pending requests require explicit approval and decline escape timeout or abort clean up',async()=>{
  for(const action of ['deny','escape','abort','timeout']){
    const ui=dom(),controller=new AbortController();const p=authorizeInference({...request,signal:controller.signal},{document:ui.document,online:()=>true,timeoutMs:action==='timeout'?5:1000});
    const expected=action==='abort'?'inferenceConsentCancelled':action==='timeout'?'inferenceConsentTimedOut':'inferenceConsentDenied';const rejected=assert.rejects(p,code(expected));
    assert.equal(ui.document.activeElement,ui.button("Don't send"));
    if(action==='deny')ui.button("Don't send").click();if(action==='escape')ui.nodes.find(n=>n.tag==='dialog').dispatchEvent(new Event('cancel',{cancelable:true}));if(action==='abort')controller.abort();
    await rejected;assert.ok(ui.nodes.find(n=>n.tag==='dialog').removed);
  }
  const ui=dom();ui.document.createElement=()=>{throw Error('private DOM detail');};await assert.rejects(authorizeInference(request,{document:ui.document,online:()=>true}),e=>e.code==='inferenceConsentUnavailable'&&!e.message.includes('private'));
});
test('approved scopes retain exact bytes link cancellation and remove active controls',async()=>{
  for(const cancel of ['user','caller','complete']){
    const ui=dom(),controller=new AbortController();const p=authorizeInference({...request,signal:controller.signal},{document:ui.document,online:()=>true});
    assert.equal(ui.nodes.find(n=>n.tag==='pre').textContent,request.bytes);
    ui.button('Send this request').click();const scope=await p;
    assert.equal(scope.disclosure.bytes,request.bytes);assert.equal(scope.signal.aborted,false);
    if(cancel==='user')ui.button('Stop cloud request (openrouter)').click();if(cancel==='caller')controller.abort();if(cancel==='complete')scope.close();
    assert.equal(scope.signal.aborted,cancel!=='complete');assert.ok(ui.nodes.find(n=>n.tag==='aside').removed);
  }
  const ui=dom();let online=true;const p=authorizeInference(request,{document:ui.document,online:()=>online});online=false;ui.button('Send this request').click();await assert.rejects(p,code('inferenceOffline'));
});
test('actual paid adapter refuses before transport and binds approval to exact bytes credential owner and abort signal',async()=>{
  const source=fs.readFileSync(new URL('../shell/inference.js',import.meta.url),'utf8');const start=source.indexOf('async function paidGenerateOnce'),end=source.indexOf('// ---- the route:',start);const codeText=source.slice(start,end)+'\npaidGenerateOnce';
  for(const allow of [false,true]){
    const owner='visitor';
    let calls=0,closed=0;const signal=new AbortController().signal;
    const context={providerOf:()=> 'openrouter',paidId:()=> 'model',coreReady:async()=>({run:()=>({bytes:request.bytes})}),inferenceRoute:async()=>({kind:'visitorOpenRouter',provider:'openrouter',key:'secret key',credentialOwner:'visitor'}),viewReady:async()=>({}),settingsGet:async()=>owner==='visitor'?{providerSettings:{openrouter:{apiKey:{value:'secret key'}}}}:{},location:{origin:'https://foundry.test'},authorizeInference:async input=>{assert.equal(input.bytes,request.bytes);assert.equal(input.credentialOwner,owner);assert.ok(!Object.hasOwn(input,'key'));if(!allow)throw Object.assign(Error('declined'),{code:'inferenceConsentDenied'});return{disclosure:input,signal,close(){closed++;}};},cloudCompletion:async input=>{calls++;assert.equal(input.bytes,request.bytes);assert.equal(input.signal,signal);return{text:'answer',finish:'stop',last:{},ttftMs:1};}};
    const paid=vm.runInNewContext(codeText,context);
    if(allow){await paid({model:'openrouter/model'});assert.equal(calls,1);assert.equal(closed,1);}else{await assert.rejects(paid({model:'openrouter/model'}),code('inferenceConsentDenied'));assert.equal(calls,0);}
  }
});
test('transport refuses redirects and cookies and every production paid path uses consent',async()=>{
  let options;await assert.rejects(cloudCompletion({provider:'openrouter',key:'secret',bytes:'{}'},{fetch:async(_url,o)=>{options=o;return new Response('',{status:401});}}),code('inferenceUnauthorized'));
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');assert.ok(!read('../shell/host.js').includes('streamOpenRouter'));
  const source=read('../shell/inference.js');assert.equal((source.match(/await cloudCompletion\(/g)||[]).length,1);assert.ok(source.includes('const permission = await authorizeInference('));assert.ok(source.includes('finally { permission.close(); }'));
  assert.ok(read('../../.github/workflows/studio.yml').includes('node tools/inference_consent_browser.mjs'));
});
