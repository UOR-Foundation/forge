import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { collectGeneration } from './canonical_generation.mjs';
function repo(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-generation-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
 git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','test');
 for(const [file,body] of Object.entries({'CONFORMANCE.md':'old\n','app/lexlean.lock':'old\n','app/src/Main.lex.tex':'old\n','xtask/src/main.rs':'old\n','AGENTS.md':'policy\n','template.lock':JSON.stringify({policy_files:[{path:'AGENTS.md'}]}),'prismpm.lock':JSON.stringify({sdk_image:'ghcr.io/uor-foundation/sdk@sha256:'+'a'.repeat(64)})})){
  fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),body);
 }
 git('add','.');git('commit','-qm','base');return {dir,git,source:git('rev-parse','HEAD')};
}
test('canonical receipt binds exact source SDK and patch without changing the source commit',()=>{
 const r=repo();try{
  fs.writeFileSync(path.join(r.dir,'CONFORMANCE.md'),'new\n');
  const result=collectGeneration(r.dir,r.source);
  assert.equal(result.receipt.source,r.source);assert.equal(result.receipt.sdk,'ghcr.io/uor-foundation/sdk@sha256:'+'a'.repeat(64));
  assert.equal(result.receipt.patchSha256,createHash('sha256').update(result.patch).digest('hex'));
  assert.equal(result.receipt.acceptance,false);assert.deepEqual(result.receipt.files,['CONFORMANCE.md']);assert.match(result.patch,/\+new/);
  assert.equal(r.git('rev-parse','HEAD'),r.source);
  assert.equal(r.git('diff','--cached','--name-only'),'');
 }finally{fs.rmSync(r.dir,{recursive:true,force:true});}
});
test('wrong source SDK universal file unexpected writer and untracked outputs fail closed',()=>{
 const r=repo();try{
  assert.throws(()=>collectGeneration(r.dir,'b'.repeat(40)),/canonicalSourceMismatch/);
  for(const [file,body] of [['AGENTS.md','changed'],['prismpm.lock',JSON.stringify({sdk_image:'sdk:latest'})],['new.txt','untracked']]){
   fs.writeFileSync(path.join(r.dir,file),body);
   assert.throws(()=>collectGeneration(r.dir,r.source),/canonicalUnexpectedWrite|canonicalInvalidSdk/);
   r.git('reset','--hard','HEAD');r.git('clean','-fd');
  }
  fs.rmSync(path.join(r.dir,'app/lexlean.lock'));assert.throws(()=>collectGeneration(r.dir,r.source),/canonicalUnexpectedWrite/);
  r.git('reset','--hard','HEAD');
  fs.chmodSync(path.join(r.dir,'xtask/src/main.rs'),0o755);assert.throws(()=>collectGeneration(r.dir,r.source),/canonicalUnexpectedWrite/);
  r.git('reset','--hard','HEAD');
  fs.writeFileSync(path.join(r.dir,'prismpm.lock'),JSON.stringify({sdk_image:'sdk:latest'}));r.git('add','.');r.git('commit','-qm','invalid SDK');
  assert.throws(()=>collectGeneration(r.dir,r.git('rev-parse','HEAD')),/canonicalInvalidSdk/);
 }finally{fs.rmSync(r.dir,{recursive:true,force:true});}
});
test('all allowed existing writer categories produce reviewable patches and no-op is explicit',()=>{
 const r=repo();try{
  assert.equal(collectGeneration(r.dir,r.source).receipt.files.length,0);
  for(const file of ['app/lexlean.lock','app/src/Main.lex.tex','xtask/src/main.rs'])fs.writeFileSync(path.join(r.dir,file),'canonical\n');
  assert.equal(collectGeneration(r.dir,r.source).receipt.files.length,3);
  // A byte-bound Rust file remains forbidden even though Rust formatting is a permitted category.
  fs.writeFileSync(path.join(r.dir,'template.lock'),JSON.stringify({policy_files:[{path:'xtask/src/main.rs'}]}));
  assert.throws(()=>collectGeneration(r.dir,r.source),/canonicalUnexpectedWrite/);
  r.git('reset','--hard','HEAD');
  fs.writeFileSync(path.join(r.dir,'template.lock'),JSON.stringify({policy_files:[{path:'xtask/src/main.rs'}]}));r.git('add','.');r.git('commit','-qm','protect Rust');
  fs.writeFileSync(path.join(r.dir,'xtask/src/main.rs'),'canonical but forbidden\n');
  assert.throws(()=>collectGeneration(r.dir,r.git('rev-parse','HEAD')),/canonicalUnexpectedWrite/);
 }finally{fs.rmSync(r.dir,{recursive:true,force:true});}
});
test('generation workflow never writes remotely or substitutes generated-tree acceptance',()=>{
 const text=fs.readFileSync(new URL('../../.github/workflows/canonical-generation.yml',import.meta.url),'utf8');
 assert.match(text,/pull_request:/);assert.match(text,/workflow_dispatch:/);
 assert.match(text,/contents: read/);assert.ok(!/contents: write|id-token:|secrets\.|pull_request_target|git push|workflow run|just vv|prismpm verify/.test(text));
 assert.ok(text.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}'));
 assert.equal((text.match(/SOURCE: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/g)||[]).length,2);
 assert.match(text,/persist-credentials: false/);assert.match(text,/--user/);assert.ok(!text.includes('/var/run/docker.sock'));
 assert.match(text,/cargo fmt --all/);assert.match(text,/just model-write/);assert.equal((text.match(/lexlean lock/g)||[]).length,2);assert.match(text,/lexlean fmt --all/);
 assert.match(text,/canonical_generation.mjs collect/);assert.match(text,/if-no-files-found: error/);
 const commands=text.match(/cargo fmt --all && just model-write && cd app && lexlean lock && lexlean fmt --all && lexlean lock/);
 assert.ok(commands,'canonical writer order must remain exact');
 // Execute the actual writer command with command doubles: failure stops later writers.
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-command-'));
 try{
  fs.mkdirSync(path.join(dir,'app'));fs.mkdirSync(path.join(dir,'bin'));
  for(const tool of ['cargo','just','lexlean'])fs.writeFileSync(path.join(dir,'bin',tool),`#!/bin/sh\nprintf '%s\\n' '${tool}' >> "$LOG"\n[ '${tool}' != "$FAIL" ]\n`,{mode:0o755});
  const log=path.join(dir,'log');
  const result=spawnSync('bash',['-c',commands[0]],{cwd:dir,env:{...process.env,PATH:path.join(dir,'bin')+path.delimiter+process.env.PATH,FAIL:'just',LOG:log}});
  assert.notEqual(result.status,0);assert.deepEqual(fs.readFileSync(log,'utf8').trim().split('\n'),['cargo','just']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
