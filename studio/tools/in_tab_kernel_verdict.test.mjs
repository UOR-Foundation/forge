import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { encodeVerdictRequest, decodeVerdictResponse, verdictWithGuest, verdictAddressWords, verdictAxiomSet } from '../shell/in-tab-verdict-codec.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const corpus = JSON.parse(read('../../verification/in-tab-kernel-verdict-vectors.json'));
const vectors = corpus.vectors, enc = new TextEncoder(), dec = new TextDecoder();
const typed = vectors.filter((v) => v.input), proved = typed.find((v) => v.name === 'proved_byLean');

test('the corpus covers every verdict and every refusal the model names', () => {
  assert.equal(vectors.length, 19); assert.equal(typed.length, 16);
  // The guest carries three vectors; the rest of the corpus is replayed against the built guest.
  assert.deepEqual(vectors.filter((v) => v.embedded).map((v) => v.name), ['proved_byLean', 'kernelChecked_withoutLean', 'refused_alteredLibrary']);
  assert.equal((read('../../app/src/ForgeKernel.lex.tex').match(/request := 0x7665726469637420/g) || []).length, 3);
  const by = (prefix) => vectors.filter((v) => v.name.startsWith(prefix)).length;
  assert.deepEqual([by('proved_'), by('kernelChecked_'), by('checking_'), by('refused_'), by('malformed_'), by('raw_')], [2, 1, 2, 9, 2, 3]);
  for (const v of typed) {
    // A request the codec refuses to write is one the corpus states for the guest alone.
    if (v.name.startsWith('malformed_')) assert.throws(() => encodeVerdictRequest(v.input), { code: 'malformedVerdictRequest' }, v.name);
    else assert.equal(dec.decode(encodeVerdictRequest(v.input)), v.request, v.name);
  }
  const shown = { proved_: 'proved', kernelChecked_: 'kernel-checked', checking_: 'checking', refused_: 'refused' };
  for (const v of vectors) {
    const reply = decodeVerdictResponse(enc.encode(v.response));
    const prefix = Object.keys(shown).find((p) => v.name.startsWith(p));
    if (prefix) assert.deepEqual(reply, { ok: true, code: Object.keys(shown).indexOf(prefix), verdict: shown[prefix] }, v.name);
    else assert.deepEqual(reply, { ok: false, code: v.response }, v.name);
  }
});

test('addresses keep all 256 bits and axioms outside the admitted three are marked', () => {
  const id = 'sha256:' + Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
  assert.deepEqual(verdictAddressWords(id), [0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c, 0x13121110, 0x17161514, 0x1b1a1918, 0x1f1e1d1c]);
  for (const bad of ['sha256:' + 'a'.repeat(63), 'blake3:' + 'a'.repeat(64), 'sha256:' + 'A'.repeat(64), null]) assert.throws(() => verdictAddressWords(bad), { code: 'malformedVerdictRequest' });
  assert.equal(verdictAxiomSet([]), 0);
  assert.equal(verdictAxiomSet(['propext', 'Quot.sound']), 5);
  assert.equal(verdictAxiomSet(['propext', 'Classical.choice', 'Quot.sound']), 7);
  assert.equal(verdictAxiomSet(['propext', 'sorryAx']), 9);
  assert.equal(verdictAxiomSet(['Lean.ofReduceBool']), 8);
  assert.throws(() => verdictAxiomSet('propext'), { code: 'malformedVerdictRequest' });
});

test('exact shapes refuse before guest dispatch, and no field can carry a server reply', async () => {
  for (const patch of [{ serverSays: 1 }, { verdict: 'proved' }, { leanRan: true }, { hasBytes: 2 }, { version: 2 }, { axiomsObserved: -1 }, { libraryDerived: Array(7).fill(0) }, { kernelPinned: [4294967296, ...Array(7).fill(0)] }])
    assert.deepEqual(await verdictWithGuest({ dispatch: () => assert.fail() }, { ...structuredClone(proved.input), ...patch }), { ok: false, code: 'malformedVerdictRequest' });
  const { leanAccepted, ...missing } = proved.input;
  assert.deepEqual(await verdictWithGuest({ dispatch: () => assert.fail() }, missing), { ok: false, code: 'malformedVerdictRequest' });
});

test('request capture precedes readiness and guest faults cannot invent a verdict', async () => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; }), input = structuredClone(proved.input), pending = verdictWithGuest(ready, input);
  input.leanAccepted = 0;
  release({ dispatch: async (bytes) => { assert.equal(dec.decode(bytes), proved.request); return enc.encode(proved.response); } });
  assert.deepEqual(await pending, { ok: true, code: 0, verdict: 'proved' });
  assert.deepEqual(await verdictWithGuest(Promise.reject(new Error('down')), proved.input), { ok: false, code: 'verdictRuntimeFailed' });
  assert.deepEqual(await verdictWithGuest({ dispatch: async () => { throw new Error('trap'); } }, proved.input), { ok: false, code: 'verdictRuntimeFailed' });
});

test('malformed replies and a word that is not its code refuse', () => {
  const good = proved.response;
  for (const value of [null, 'ok', new Uint8Array(28), enc.encode('proved'), enc.encode(good + '00'), enc.encode(good.slice(0, -1)), enc.encode('ok 02000000' + good.slice(11)), enc.encode(good.slice(0, 11) + '04000000' + '04000000'), enc.encode(good.slice(0, 11) + '00000000' + '01000000'), enc.encode(good.slice(0, 11) + '01000000' + '00000000'), enc.encode(good.toUpperCase())])
    assert.deepEqual(decodeVerdictResponse(value), { ok: false, code: 'invalidVerdictResponse' });
});

test('the model, the protocol and the kernel name one authority, and the authored files have not drifted', () => {
  const model = read('../../app/src/InTabKernel.lex.tex'), protocol = read('../../app/src/InTabKernelProtocol.lex.tex'), kernel = read('../../app/src/ForgeKernel.lex.tex'), codec = read('../shell/in-tab-verdict-codec.mjs');
  assert.equal((model.match(/theorem\{/g) || []).length, 15);
  assert.equal((protocol.match(/theorem\{/g) || []).length, 9);
  assert.ok(protocol.includes('InTabKernel::verdictCode') && protocol.includes('serverSays := 0'));
  assert.ok(kernel.includes('\\importmodule{InTabKernelProtocol}') && kernel.includes('InTabKernelProtocol::dispatchVerdict') && kernel.includes('else (dispatchApplication value))') && kernel.includes('acceptanceVectors := (verdictAcceptance)'));
  // The codec decides nothing: it holds no comparison of addresses and none of the model's rules.
  for (const word of ['Pinned ===', 'Derived ===', 'leanAccepted ===', 'secondAccepted ==='] ) assert.ok(!codec.includes(word), word);
  execFileSync(process.execPath, [fileURLToPath(new URL('./in_tab_verdict_author.mjs', import.meta.url)), '--check'], { stdio: 'pipe' });
});
