import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createManifest, assertDeployment, assertArtifact, responseIdentity, observeResponses } from './pages_live_identity.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-live-'));
fs.writeFileSync(path.join(root, 'index.html'), 'expected');
fs.mkdirSync(path.join(root, 'v2'));
fs.writeFileSync(path.join(root, 'v2/index.html'), 'v2');
const manifest = createManifest(root);
const expected = { schema: 1, digest: manifest.digest, source: 'a'.repeat(40), run: '123', attempt: '1' };

test('manifest names actual bytes, including v2, and unchanged bytes reuse identity', () => {
 assert.deepEqual(createManifest(root), manifest);
 fs.writeFileSync(path.join(root, 'v2/index.html'), 'changed');
 assert.notEqual(createManifest(root).digest, manifest.digest);
 fs.writeFileSync(path.join(root, 'v2/index.html'), 'v2');
});
test('superseded and deployment advances fail closed before reuse and after observation', async () => {
 let current = expected;
 const fetcher = async () => ({ ok: true, json: async () => current });
 await assertDeployment('https://example.test/foundry/', expected, fetcher);
 current = { ...expected, run: '124' };
 await assert.rejects(assertDeployment('https://example.test/foundry/', expected, fetcher), /pagesLiveIdentityMismatch/);
 for (const field of ['source', 'attempt', 'digest', 'schema']) {
  current = { ...expected, [field]: 'wrong' };
  await assert.rejects(assertDeployment('https://example.test/foundry/', expected, fetcher), /pagesLiveIdentityMismatch/);
 }
 await assert.rejects(assertDeployment('https://example.test/foundry/', expected, async () => ({ok:false})), /pagesLiveIdentityMismatch/);
});
test('received static bytes, not a marker alone, bind the browser observation', () => {
 const base = 'https://example.test/foundry/';
 assert.equal(responseIdentity(manifest, base, base, Buffer.from('expected')), true);
 assert.equal(responseIdentity(manifest, base, base + 'index.html?cache=1', Buffer.from('expected')), true);
 assert.throws(() => responseIdentity(manifest, base, base, Buffer.from('other deployment')), /pagesLiveResponseMismatch/);
 assert.equal(responseIdentity(manifest, base, base + '__dynamic_preview', Buffer.from('dynamic')), false);
 assert.equal(responseIdentity(manifest, base, base + 'chat?id=1', Buffer.from('expected'), true), true);
 assert.throws(() => responseIdentity(manifest, base, base + 'chat?id=1', Buffer.from('wrong closure'), true), /pagesLiveResponseMismatch/);
 assert.equal(responseIdentity(manifest, base, base + 'p/1/index.html', Buffer.from('generated preview'), true), false);
 const ui = {files:{'ui/index.html':manifest.files['index.html']}};
 assert.equal(responseIdentity(ui, base, base + 'ui/chat?id=1', Buffer.from('expected'), true), true);
 assert.throws(() => responseIdentity(ui, base, base + 'ui/chat?id=1', Buffer.from('wrong closure'), true), /pagesLiveResponseMismatch/);
});
test('asynchronous response failures are awaited, retained and cannot become success', async () => {
 let listener;
 const context = { on: (event, fn) => { if (event === 'response') listener = fn; } };
 const finish = observeResponses(context, manifest, 'https://example.test/foundry/');
 listener({ url: () => 'https://example.test/foundry/', body: async () => Buffer.from('wrong') });
 await assert.rejects(finish(), /pagesLiveResponseMismatch/);
});
test('no observed index is not successful live evidence', async () => {
 const finish = observeResponses({on(){}}, manifest, 'https://example.test/foundry/');
 await assert.rejects(finish(), /pagesLiveResponseMismatch/);
});

test('cache reuse verifies all deployed bytes even when the marker has not changed', async () => {
 const good = async url => ({ok:true, arrayBuffer:async () => Buffer.from(url.pathname.endsWith('/v2/index.html') ? 'v2' : 'expected')});
 await assertArtifact('https://example.test/foundry/', manifest, good);
 await assert.rejects(assertArtifact('https://example.test/foundry/', manifest, async () => ({ok:true, arrayBuffer:async () => Buffer.from('other')})), /pagesLiveResponseMismatch/);
 await assert.rejects(assertArtifact('https://example.test/foundry/', manifest, async () => ({ok:false})), /pagesLiveResponseMismatch/);
 await assert.rejects(assertArtifact('https://example.test/foundry/', {...manifest, digest:'forged'}, good), /pagesLiveIdentityMismatch/);
 await assert.rejects(assertArtifact('https://example.test/foundry/', manifest, async () => { throw new TypeError('offline'); }), /pagesLiveResponseMismatch/);
});

test('network failure or unfinished static response cannot be cached as successful evidence', async () => {
 for (const event of ['requestfailed', 'request']) {
  const listeners = {};
  const finish = observeResponses({on:(event,fn) => listeners[event]=fn}, manifest, 'https://example.test/foundry/');
  listeners.response({url:()=>'https://example.test/foundry/', body:async()=>Buffer.from('expected')});
  listeners[event]({url:()=>'https://example.test/foundry/v2/index.html'});
  await assert.rejects(finish(), /pagesLiveResponseMismatch/);
 }
});

test('representative marker-only mutation is rejected by the byte-binding oracle', async () => {
 const source = fs.readFileSync(new URL('./pages_live_identity.mjs', import.meta.url), 'utf8');
 const mutated = source.replace('hash(body) !== manifest.files[rel]', 'false');
 assert.notEqual(mutated, source, 'mutation must plant the representative defect');
 const broken = await import('data:text/javascript;base64,' + Buffer.from(mutated).toString('base64'));
 assert.throws(() => assert.throws(() => broken.responseIdentity(manifest, 'https://example.test/foundry/', 'https://example.test/foundry/', Buffer.from('wrong')), /pagesLiveResponseMismatch/), /Missing expected exception/);
});

test('deployment lock, success-only cache reuse, and both complete artifact checks remain mandatory', () => {
 const source = fs.readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
 const deploy = source.split('\n  deploy:')[1];
 assert.ok(deploy);
 const guard = deploy.match(/^    if: (.+)$/m)?.[1];
 assert.ok(guard, 'production deploy must have a main-only job guard');
 assert.equal(vm.runInNewContext(guard, {github:{ref:'refs/heads/main'}}), true);
 for (const ref of ['refs/heads/feature', 'refs/pull/1/merge', 'refs/tags/v1'])
  assert.equal(vm.runInNewContext(guard, {github:{ref}}), false, 'non-main source must never deploy production');
 assert.ok(!source.includes('\n  live:'), 'lock cannot be released before observation');
 assert.match(deploy, /concurrency:\n      group: pages\n      cancel-in-progress: false/);
 const steps = deploy.split('\n      - ');
 for (const name of ['Verify the deployed identity and every artifact byte before live evidence reuse', 'Recheck deployment and all bytes after live observation']) {
  const step = steps.find(x => x.startsWith('name: ' + name + '\n'));
  assert.ok(step, name);
  assert.match(step, /if: steps.deployment.outcome == 'success'/);
  assert.match(step, /set -euo pipefail/);
  assert.equal((step.match(/pages_live_identity.mjs check /g)||[]).length, 2);
  assert.equal((step.match(/pages_live_identity.mjs artifact /g)||[]).length, 1);
 }
 for (const step of steps.filter(x => x.includes('live-seen'))) {
  assert.match(step, /if: steps.deployment.outcome == 'success'/, 'superseded run may not read or save live evidence');
 }
 assert.equal((deploy.match(/'src\/studio\/tools\/fixtures\/\*\*'/g)||[]).length, 2, 'fixture changes must invalidate both cache keys');
 assert.match(deploy, /PAGES_LIVE_MANIFEST="\$RUNNER_TEMP\/pages-manifest.json"/);
 assert.match(deploy, /live-seen-v2-playwright-1.56.1-\$\{\{ steps.artifact-identity.outputs.digest \}\}/);
});
