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
test('mandatory acceptance observes duplicate CSS requests and actual styled renderer navigation',async()=>{
 const workflow=read('.github/workflows/studio.yml'),browser=read('studio/tools/renderer_stylesheet_identity_browser.mjs');
 assert.ok(workflow.includes('node tools/renderer_stylesheet_identity_browser.mjs'));
 for(const required of ['stylesheetRequests,1','getComputedStyle','Build your ideas with Prism','/settings','serviceWorkers: "block"'])assert.ok(browser.includes(required),required);
 assert.equal((browser.match(/assert\.equal\(stylesheetRequests,1,/g)||[]).length,2,'both Home and Settings must refuse duplicate stylesheet loads');
 assert.ok(browser.includes("assert.equal(await tab.locator('body').evaluate(el=>getComputedStyle(el).fontFamily.includes('Geist')),true)"));
 // Execute the browser oracle itself with controlled computed styles. This checks its assertions,
 // not the renderer; only the actual-browser command qualifies rendered CSS and network identity.
 const start=browser.indexOf('  const headlineSizes = [];'),end=browser.indexOf("  assert.equal(await tab.locator('link[rel=stylesheet]",start);
 assert.ok(start>0&&end>start,'the mandatory responsive heading oracle must precede stylesheet and Settings checks');
 const layoutStart=browser.indexOf("  const homeLayouts = [];",start);
 assert.ok(layoutStart>start&&layoutStart<end);
 const oracle=browser.slice(start,layoutStart)+"  await tab.setViewportSize({ width: 1280, height: 900 });";
 const expected=[[390,'34px'],[809,'34px'],[810,'34.02px'],[1280,'53.76px'],[1309,'54.978px'],[1310,'55px'],[1440,'55px']];
 const exercise=async computed=>{
  let width;const visited=[];
  const element={};
  const tab={
   async setViewportSize(size){width=size.width;assert.equal(size.height,900);},
   locator(selector){assert.equal(selector,'[data-slot="home-stage"] h1');return {async evaluate(callback){visited.push(width);return callback(element);}};},
  };
  const sizes=await vm.runInNewContext(`(async()=>{${oracle};return headlineSizes;})()`,{assert,tab,getComputedStyle:el=>{assert.equal(el,element);return {fontSize:computed(width)};}});
  return {sizes:JSON.parse(JSON.stringify(sizes)),visited,width};
 };
 const correct=width=>new Map(expected).get(width);
 const actual=await exercise(correct);
 assert.deepEqual(actual.visited,expected.map(([w])=>w),'no width or clamp transition may be omitted');
 assert.deepEqual(actual.sizes,expected.map(([width,fontSize])=>({width,fontSize})));
 assert.equal(actual.width,1280,'restore desktop navigation before Settings');
 // Only the extracted browser assertion may reject a bad style, not the harness's report checks.
 for(const [width] of expected)await assert.rejects(exercise(w=>w===width?'48px':correct(w)),{code:'ERR_ASSERTION'},`the oracle must reject a wrong size at ${width}px`);
 const layoutOracle=browser.slice(layoutStart,end),layoutWidths=[390,767,768,1023,1024,1280];
 const exerciseLayout=async mutate=>{
  let width;const visited=[];
  const tab={async setViewportSize(size){width=size.width;assert.equal(size.height,900);},locator(selector){
   assert.equal(selector,'[data-slot="home-page"]');return {async evaluate(callback){
    visited.push(width);
    const data={columns:width<1024?2:4,visibleIdeas:width<768?0:2,surpriseShown:true,widths:[120,120,120,120]};
    mutate?.(data,width);
    const region={children:data.widths.map(value=>({getBoundingClientRect:()=>({width:value})})),style:{gridTemplateColumns:Array(data.columns).fill('120px').join(' ')}};
    const idea=i=>({matches:()=>false,style:{display:i<data.visibleIdeas?'block':'none'}});
    const surprise={matches:()=>true,style:{display:data.surpriseShown?'block':'none'}};
    const suggestions={children:[idea(0),idea(1),surprise],querySelector(s){assert.equal(s,'[data-slot="home-surprise"]');return surprise;}};
    return callback({querySelector(s){if(s==='[data-slot="home-featured"] [role="region"]')return region;assert.equal(s,'[data-slot="home-suggestions"]');return suggestions;}});
   }};
  }};
  const layouts=await vm.runInNewContext("(async()=>{"+layoutOracle+";return homeLayouts;})()",{assert,tab,getComputedStyle:el=>el.style});
  return {layouts:JSON.parse(JSON.stringify(layouts)),visited,width};
 };
 const layouts=await exerciseLayout();
 assert.deepEqual(layouts.visited,layoutWidths,'every grid/chip breakpoint must execute');
 assert.equal(layouts.width,1280);
 assert.deepEqual(layouts.layouts.map(({width,columns,visibleIdeas,surpriseShown})=>({width,columns,visibleIdeas,surpriseShown})),layoutWidths.map(width=>({width,columns:width<1024?2:4,visibleIdeas:width<768?0:2,surpriseShown:true})));
 for(const width of layoutWidths)for(const mutate of [data=>data.columns=3,data=>data.visibleIdeas=data.visibleIdeas?0:2,data=>data.surpriseShown=false,data=>data.widths.pop(),data=>data.widths[1]=233])
  await assert.rejects(exerciseLayout((data,w)=>{if(w===width)mutate(data);}),{code:'ERR_ASSERTION'},'the actual layout oracle must reject incorrect data at '+width);

});
