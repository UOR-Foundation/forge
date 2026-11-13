import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const source=read('studio/core/src/bin/project_shell.rs');
const script=source.match(/<script>\n\/\/ Vite identifies[\s\S]*?<\/script>/)?.[0].replace(/^<script>|<\/script>$/g,'').replace(/\{\{/g,'{').replace(/\}\}/g,'}');
test('stylesheet normalization preserves the resolved resource at root nested and encoded deployment paths',()=>{
 assert.ok(script,'projector must emit normalization');
 for(const base of ['https://example.test/','https://example.test/foundry/','https://example.test/team/app%20space/']){
  const resolved=new URL('assets/index.css',base),attributes={};
  vm.runInNewContext(script,{URL,document:{baseURI:base,getElementById:id=>{assert.equal(id,'renderer-style');return {href:resolved.href,setAttribute:(name,value)=>attributes[name]=value};}}});
  assert.equal(attributes.href,resolved.pathname);assert.equal(new URL(attributes.href,base).href,resolved.href);
 }
});
test('initial stylesheet identity precedes the unchanged host and renderer module boundary',()=>{
 assert.ok(source.includes('<link id="renderer-style" rel="stylesheet" crossorigin>'));
 assert.ok(source.indexOf('const style = document.getElementById("renderer-style")')<source.indexOf('<script type="module" src="host.bundle.js"></script>'));
 assert.ok(source.indexOf('<script type="module" src="host.bundle.js"></script>')<source.indexOf('<script type="module" src="assets/index.js"></script>'));
 assert.ok(!source.includes('async src="assets/index.js"'));
 assert.ok(read('app/src/FoundrySpecification.lex.tex').includes('name: rendererStylesheetBoundary,'));
});
test('mandatory acceptance observes duplicate CSS requests and actual styled renderer navigation',()=>{
 const workflow=read('.github/workflows/studio.yml'),browser=read('studio/tools/renderer_stylesheet_identity_browser.mjs');
 assert.ok(workflow.includes('node tools/renderer_stylesheet_identity_browser.mjs'));
 for(const required of ['stylesheetRequests,1','getComputedStyle','Build your ideas with Prism','/settings','serviceWorkers: "block"'])assert.ok(browser.includes(required),required);
});
