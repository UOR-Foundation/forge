import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {captureGalleryCommand,publishGallery,readGallery} from '../shell/gallery-store.mjs';
const source=()=>({name:'Gallery',reference:'blake3:'+'a'.repeat(64),files:[['src/a','one']],dependencies:[]});
const card={description:'Make images smaller without losing quality by comparing formats side by side as you go.',tag:'Creative'};
test('gallery commands detach source files dependencies and card before readiness',()=>{
 const s=source(),p={card:{...card}},c=captureGalleryCommand(1,s,p);s.files[0][1]='changed';s.dependencies.push('other');p.card.description='changed';assert.equal(c.source.files[0][1],'one');assert.deepEqual(c.source.dependencies,[]);assert.deepEqual(c.patch.card,card);
});
test('gallery refuses malformed ownership picture bounds and unqualified card values',()=>{
 for(const [id,s,p] of [[0,source(),{card}],[1,{...source(),reference:'private'}, {card}],[1,{...source(),files:[['x','one'],['x','two']]},{card}],[1,source(),{picture:new Blob([],{type:'image/webp'}),version:'v'}],[1,source(),{picture:new Blob(['x'],{type:'image/png'}),version:'v'}],[1,source(),{picture:new Blob([new Uint8Array(8*1024*1024+1)],{type:'image/webp'}),version:'v'}],[1,source(),{card:{description:'unqualified',tag:'Other'}}],[1,source(),{unknown:true}],[1,source(),{version:'v'}]])assert.throws(()=>captureGalleryCommand(id,s,p),{code:'invalidGalleryCommand',message:'invalidGalleryCommand'});
});
test('gallery public storage failures do not reveal database errors or private contents',async()=>{
 const db={transaction(){throw Error('PRIVATE_DATABASE_DETAIL');}};
 for(const operation of [()=>publishGallery(db,1,source(),{card}),()=>readGallery(db,1),()=>publishGallery(Promise.reject(Error('PRIVATE')),1,source(),{card}),()=>readGallery(Promise.reject(Error('PRIVATE')),1)])await assert.rejects(operation,{code:'galleryStorageFailed',message:'galleryStorageFailed'});
});
test('gallery consumers and deletion use the qualified source-bound storage boundary',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8'),host=read('../shell/host.js'),renderer=read('../vendor/dyad/hologram.screens/useAppThumbnails.ts');
 assert.ok(host.includes('publishGallery(dbReady, appId, source, {card:read.card})'));assert.ok(host.includes('coverApp(appId, appUrl, await source)'));assert.ok(!host.includes('covers.saveCover(')&&!host.includes('covers.saveCard('));assert.ok(renderer.includes('window.__gallery.read(appId)'));assert.ok(!renderer.includes('caches.open(')&&!renderer.includes('inference.js'));assert.ok(host.includes('Object.freeze({read: appId => readGallery(dbReady, appId)})'));assert.ok(renderer.includes('URL.revokeObjectURL'));assert.ok(read('../shell/project-lifecycle.mjs').includes('refs.delete(`gallery:${appId}`)'));assert.ok(read('../../.github/workflows/studio.yml').includes('node tools/source_bound_gallery_browser.mjs'));
});
