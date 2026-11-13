import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync as importSpawn } from 'node:child_process';
import { sourceInputs, createClaim, verifyClaim, requireHead, attestationArgs } from './pages_source_binding.mjs';

function repository() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-source-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test');
  const commit = (file, value) => { fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file), value);git('add','.');git('commit','-qm',file);return git('rev-parse','HEAD'); };
  return {dir,git,commit};
}
test('FA-90 signed producer reuse requires identical build inputs, not identical producer SHA', () => {
  const r=repository();try {
    const producer=r.commit('app/source','kernel A'); const holo=Buffer.from('proved holo A');
    const claim=createClaim(producer,holo,'a'.repeat(64),r.dir);
    const adopted=r.commit('studio/style.css','new shell');
    assert.notEqual(producer,adopted);assert.equal(sourceInputs(producer,r.dir),sourceInputs(adopted,r.dir));
    assert.equal(verifyClaim(claim,holo,adopted,r.dir).source,producer);
    const changed=r.commit('app/source','kernel B');
    assert.throws(()=>verifyClaim(claim,holo,changed,r.dir),/pagesInputMismatch/);
    assert.throws(()=>verifyClaim(claim,Buffer.from('other valid old holo'),adopted,r.dir),/pagesArtifactMismatch/);
    assert.throws(()=>verifyClaim({...claim,inputs:'b'.repeat(64)},holo,adopted,r.dir),/pagesInputMismatch/);
    assert.throws(()=>verifyClaim({...claim,source:changed},holo,adopted,r.dir),/pagesInputMismatch/);
    assert.throws(()=>verifyClaim({...claim,fingerprint:'x'},holo,adopted,r.dir),/pagesInvalidClaim/);
    assert.throws(()=>verifyClaim({},holo,adopted,r.dir),/pagesInvalidClaim/);
  } finally {fs.rmSync(r.dir,{recursive:true,force:true});}
});
test('input digest covers SDK, policy, dotfiles and names, excluding only documented independent sources',()=>{
 const r=repository();try {
 let prior=r.commit('app/source','A');let digest=sourceInputs(prior,r.dir);
 for(const file of ['prismpm.lock','.github/workflows/pages.yml','.policy','app/new-name','studio/tools/pages_source_binding.mjs']){const next=r.commit(file,'same');assert.notEqual(sourceInputs(next,r.dir),digest,file);digest=sourceInputs(next,r.dir);}
 for(const file of ['studio/style.css','v2/unused','.github/workflows/other.yml']){const next=r.commit(file,'same');assert.equal(sourceInputs(next,r.dir),digest,file);}
 }finally{fs.rmSync(r.dir,{recursive:true,force:true});}
});
test('stale trigger and changed remote head cannot adopt or publish',()=>{
 const a='a'.repeat(40),b='b'.repeat(40);requireHead(a,a,a);
 for(const args of [[a,b,a],[a,a,b],['',a,a],[a,a,'']])assert.throws(()=>requireHead(...args),/pagesStaleSource/);
});
test('signature policy binds both claim and holo to Pages and the actual producer',()=>{
 const args=attestationArgs('claim.json','a'.repeat(40),'UOR-Foundation/foundry');
 assert.deepEqual(args,['attestation','verify','claim.json','--repo','UOR-Foundation/foundry','--signer-workflow','UOR-Foundation/foundry/.github/workflows/pages.yml','--source-digest','a'.repeat(40),'--deny-self-hosted-runners']);
});
test('adoption CLI requires both verified subjects and writes no evidence on signature or stale-head failure',()=>{
 const r=repository();try {
  const producer=r.commit('app/source','A'),holo=Buffer.from('A');
  const claim=createClaim(producer,holo,'a'.repeat(64),r.dir),adopted=r.commit('studio/style.css','changed');
  const bin=path.join(r.dir,'bin'),pin=path.join(r.dir,'.pin'),envFile=path.join(r.dir,'env');
  fs.mkdirSync(bin);fs.mkdirSync(pin);fs.writeFileSync(path.join(pin,'producer.json'),JSON.stringify(claim));fs.writeFileSync(path.join(pin,'app.holo'),holo);
  const realGit=execFileSync('which',['git'],{encoding:'utf8'}).trim();
  fs.writeFileSync(path.join(bin,'git'),`#!/bin/sh\nif [ "$1" = ls-remote ]; then printf '%s\\trefs/heads/main\\n' "$REMOTE_HEAD"; else exec ${JSON.stringify(realGit)} "$@"; fi\n`,{mode:0o755});
  fs.writeFileSync(path.join(bin,'gh'),`#!/usr/bin/env node\nconst fs=require('fs');fs.appendFileSync(process.env.CALLS,JSON.stringify(process.argv.slice(2))+'\\n');if(process.env.REJECT==='yes')process.exit(1);\n`,{mode:0o755});
  const cli=new URL('./pages_source_binding.mjs',import.meta.url).pathname, calls=path.join(r.dir,'calls');
  const run=(remote,reject='no',trigger=adopted)=>{
   fs.writeFileSync(envFile,'');fs.writeFileSync(calls,'');
   return importSpawn(process.execPath,[cli,'adopt','.pin',trigger,'UOR-Foundation/foundry'],{cwd:r.dir,encoding:'utf8',env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,REMOTE_HEAD:remote,REJECT:reject,CALLS:calls,GITHUB_ENV:envFile}});
  };
  assert.match(run(adopted,'yes').stderr,/pagesSignatureMismatch/);
  assert.equal(run(adopted).status,0);
  const verified=fs.readFileSync(calls,'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(verified,[attestationArgs('.pin/producer.json',producer,'UOR-Foundation/foundry'),attestationArgs('.pin/app.holo',producer,'UOR-Foundation/foundry')]);
  assert.match(fs.readFileSync(envFile,'utf8'),new RegExp('PRODUCER_SOURCE='+producer));
  for(const [remote,reject,trigger] of [[adopted,'yes',adopted],['b'.repeat(40),'no',adopted],[adopted,'no',producer]]) {
   assert.notEqual(run(remote,reject,trigger).status,0);assert.equal(fs.readFileSync(envFile,'utf8'),'');
  }
  fs.writeFileSync(path.join(pin,'app.holo'),'other signed holo');assert.notEqual(run(adopted).status,0);assert.equal(fs.readFileSync(calls,'utf8'),'');
 }finally{fs.rmSync(r.dir,{recursive:true,force:true});}
});

test('mandatory workflow binds source before signing and never reattributes a cached producer',()=>{
 const read=file=>fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8');
 const pages=read('.github/workflows/pages.yml'),pin=read('.github/workflows/kernel-pin.yml');
 assert.ok(pages.indexOf('pages_source_binding.mjs create')<pages.indexOf('id: attest1'));
 assert.equal((pages.match(/            site\/producer.json/g)||[]).length,3);
 assert.ok(pages.includes('"$PAGE/producer.json" kernel-proof/'));
 assert.ok(pages.includes('key=prism-page-v3-'));
 assert.ok(pages.includes("'.github/workflows/pages.yml', 'studio/tools/pages_source_binding.mjs')"));
 assert.ok(pin.includes('ref: ${{ github.event.workflow_run.head_sha || env.REF }}'));
 assert.ok(pin.includes('pages_source_binding.mjs adopt .pin "$TRIGGER" "$GITHUB_REPOSITORY"'));
 assert.ok(!pin.includes('SOURCE: ${{ github.sha }}'));
 assert.ok(pin.includes('SOURCE=${PRODUCER_SOURCE:-$(git rev-parse HEAD)}'));
 assert.ok(pin.includes('run: git push '));assert.ok(!pin.includes('--force'));
 assert.ok(read('.github/workflows/studio.yml').includes('tools/pages_source_binding.test.mjs'));
});
