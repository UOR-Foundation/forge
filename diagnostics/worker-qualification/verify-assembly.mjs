import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const [mode] = process.argv.slice(2);
const root=process.cwd(), assembly=join(root,'assembly'), source=join(root,'source');
async function files(dir) {
  const out=[];
  for (const e of await readdir(dir,{withFileTypes:true})) {
    assert(!e.isSymbolicLink(), `symlink ${dir}/${e.name}`);
    if(e.isDirectory()) out.push(...(await files(join(dir,e.name))).map(n=>e.name+'/'+n));
    else if(e.isFile()) out.push(e.name);
  }
  return out.sort();
}
const digest=b=>createHash('sha256').update(b).digest('hex');
for(const sub of ['try/vendor','app/src']) {
  const expected=await files(join(source,sub)), actual=await files(join(assembly,sub));
  assert.deepEqual(actual,expected,`missing or extra assembly inputs: ${sub}`);
  for(const n of expected) assert.equal(digest(await readFile(join(assembly,sub,n))),digest(await readFile(join(source,sub,n))),`changed assembly input: ${sub}/${n}`);
}
const {loadArchive}=await import(pathToFileURL(join(assembly,'try/vendor/prism-code/src/index.mjs')));
const holo=await loadArchive(new Uint8Array(await readFile(join(assembly,'site/app.holo'))));
assert(holo.vectors.length>0 && holo.model.application.core_contract && holo.identities.archiveFingerprint,'missing holo evidence');
const names=[];
for(const n of await files(join(assembly,'app/src'))) {
  if(!n.endsWith('.lex.tex') || n.startsWith('Foundation/')) continue;
  const text=await readFile(join(assembly,'app/src',n),'utf8');
  const matches=[...text.matchAll(/^theorem\{\s*name:\s*([^,\n]+),/gm)];
  assert.equal(matches.length,[...text.matchAll(/^theorem\{/gm)].length,`unsupported theorem declaration ${n}`);
  names.push(...matches.map(m=>m[1].trim()));
}
assert(names.length>0,'no source theorems');
if(mode==='after') {
  const log=await readFile(join(root,'evidence/page-build.log'),'utf8');
  assert(!log.includes('no holo at build'),'page silently omitted holo evidence');
  const html=await readFile(join(assembly,'site/spec.html'),'utf8');
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const indices=[...html.matchAll(/id="vt-(\d+)"/g)].map(m=>Number(m[1]));
  assert.deepEqual(indices,Array.from({length:holo.vectors.length},(_,i)=>i),'missing rendered acceptance vectors');
  assert.equal([...html.matchAll(/class="thm"/g)].length,names.length,'missing rendered theorems');
  for(const name of names) assert(html.includes(`<span>${esc(name)}</span>`),`missing theorem ${name}`);
  for(const value of [holo.model.application.core_contract,holo.model.application.entry_root,holo.identities.archiveFingerprint]) assert(html.includes(esc(value)),`missing contract evidence ${value}`);
  for(const value of [holo.limits.request,holo.limits.response]) assert(html.includes(`up to ${value} bytes`),'missing contract limit');
}
console.log(JSON.stringify({check:'candidate assembly inputs and rendered evidence',phase:mode,vectors:holo.vectors.length,theorems:names.length,archiveFingerprint:holo.identities.archiveFingerprint}));
