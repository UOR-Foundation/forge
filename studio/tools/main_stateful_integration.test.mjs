import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const host = fs.readFileSync(new URL('../shell/host.js', import.meta.url), 'utf8');
const start = host.indexOf('async function appStateOf('), end = host.indexOf('const approve = async', start);
assert.ok(start >= 0 && end > start, 'stateful approval and proof boundaries must remain present');
const block = host.slice(start, end);
function harness({phase = 'checked', race, mutate = source => source} = {}) {
  const snapshot = (revision) => ({reference: revision, files: [['prism/App.lex.tex', 'module'], ['prism/app.json', JSON.stringify({sourceKappa: 'identity', phase})]]});
  let current = snapshot('original');
  const original = current, log = {writes: 0, proofs: 0, audits: 0, refreshes: 0};
  const environment = {
    Map, JSON, TextEncoder, enc: new TextEncoder(), core: {}, dbReady: Promise.resolve({}),
    captureProjectSource: async () => current,
    get: async (_store, key) => new Map(current.files).get(key.replace(/^1:/, '')),
    kappa: async () => 'identity', now: () => 'now',
    appShape: {SOURCE_PATH: 'prism/App.lex.tex', STATE_PATH: 'prism/app.json', isAppShape: () => true, theoremsOf: () => [{}], promisesOf: () => [], provingMessage: () => 'proving', proofMessage: () => '', proofFiles: () => ({}), withAxioms: source => source},
    appLibrary: Promise.resolve({}), readEngine: async () => {},
    prism: {proveFiles: async files => {log.proofs++; await files({}); return {ok: true, record: {id: 'attestation'}};}},
    nextPhase: async (_phase, event) => {if (event === race) current = snapshot('competing-edit'); return event === 'approve' ? 'proving' : 'proved';},
    applyStoredProjectPatch: async (_db, _app, _patch, options) => {
      if (options.source.reference !== current.reference) throw Object.assign(Error('source changed'), {code: 'projectEditConflict'});
      log.writes++; return {};
    },
    refreshApp: async () => log.refreshes++, put: async () => log.audits++,
  };
  return {...vm.runInNewContext(mutate(block) + ';({appStateOf,approveApp,proveApp})', environment), original, log};
}
test('stateful approval reads its module and standing from one captured project snapshot', async () => {
  const h = harness(), app = await h.appStateOf(1);
  assert.equal(app.captured, h.original);
  assert.equal(app.source, 'module'); assert.equal(app.state.phase, 'checked');
  assert.equal(typeof (await h.approveApp(1, app)).prove, 'function');
  assert.equal(h.log.writes, 1); assert.equal(h.log.refreshes, 1);
});
async function approvalRace(mutate) {
  const h = harness({race: 'approve', mutate}), app = await h.appStateOf(1);
  const result = await h.approveApp(1, app);
  assert.match(result.text, /changed before approval/);
  assert.equal(result.prove, undefined); assert.equal(h.log.writes, 0); assert.equal(h.log.refreshes, 0);
}
test('stateful approval refuses a concurrent source change instead of recapturing it', async () => {
  await approvalRace();
  await assert.rejects(approvalRace(source => source.replace('], app.captured);', '], await captureProjectSource(await dbReady, appId));')), {name: 'AssertionError'});
});
async function proofRace(mutate) {
  const h = harness({phase: 'proving', race: 'attest', mutate});
  assert.equal(await h.proveApp(1, 'identity', 'module'), null);
  assert.equal(h.log.proofs, 1); assert.equal(h.log.writes, 0); assert.equal(h.log.audits, 0); assert.equal(h.log.refreshes, 0);
}
test('stateful proof completion refuses a competing commit without writing source or proof', async () => {
  await proofRace();
  await assert.rejects(proofRace(source => source.replace('], latest.captured);', '], await captureProjectSource(await dbReady, appId));')), {name: 'AssertionError'});
});
test('a stateful proof whose source or phase is already stale sends no request', async () => {
  for (const [phase, key, source] of [['checked', 'identity', 'module'], ['proving', 'other', 'module'], ['proving', 'identity', 'other']]) {
    const h = harness({phase});
    assert.equal(await h.proveApp(1, key, source), null);
    assert.equal(h.log.proofs, 0); assert.equal(h.log.writes, 0);
  }
});
