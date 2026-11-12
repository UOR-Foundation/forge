import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {browserChatMode,assertBrowserChatModes} from '../shell/browser-chat-modes.mjs';
import {chatModeCatalog} from '../shell/chat-mode-catalog.mjs';
test('canonical catalog reproduces exactly and offers only implemented browser modes',()=>{
 assert.deepEqual(chatModeCatalog.modes,[{id:'build',label:'Build'},{id:'ask',label:'Ask'},{id:'plan',label:'Plan'}]);
 const r=spawnSync('python3',[new URL('./chat_mode_catalog_projection.py',import.meta.url).pathname,'--check'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
test('explicit mode precedes captured default and absent preferences preserve Build',()=>{
 for(const mode of ['build','ask','plan']){assert.equal(browserChatMode(mode,{defaultChatMode:'ask'}),mode);assert.equal(browserChatMode(undefined,{defaultChatMode:mode}),mode);assert.doesNotThrow(()=>assertBrowserChatModes({selectedChatMode:mode,defaultChatMode:mode}));}
 assert.equal(browserChatMode(undefined,{}),'build');assert.equal(browserChatMode(undefined,{selectedChatMode:'plan'}),'plan');assert.equal(browserChatMode('ask',{defaultChatMode:'invalid'}),'ask');
});
test('unsupported malformed and null modes fail before writes',()=>{
 for(const mode of ['local-agent','agent','',{},[],7,null]){assert.throws(()=>browserChatMode(mode,{}),{code:'invalidChatExecutionMode'});assert.throws(()=>assertBrowserChatModes({selectedChatMode:mode}),{code:'invalidChatExecutionMode'});assert.throws(()=>assertBrowserChatModes({defaultChatMode:mode}),{code:'invalidChatExecutionMode'});}
 assert.throws(()=>browserChatMode(undefined,{defaultChatMode:'invalid'}),{code:'invalidChatExecutionMode'});
});
test('actual selector creation settings and mandatory browser bind to canonical ownership',()=>{
 const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'),host=read('studio/shell/host.js'),picker=read('studio/vendor/dyad/hologram.ChatModeSelector.tsx');
 assert.ok(!host.includes('...BUILD_MODE'));assert.ok(host.includes('assertBrowserChatModes(patch)'));assert.ok(host.includes('browserChatMode(initialChatMode,'));assert.ok(host.includes('browserChatMode(undefined,'));
 for(const x of ['chatModeCatalog.modes','modelSelectionScope(','setChatMode(','defaultChatMode: mode','disabled={'])assert.ok(picker.includes(x),x);
 assert.ok(!read('studio/vendor/dyad/vite.shell.config.mts').includes('out.replace("<ChatModeSelector />", "{null}")'));
 assert.ok(read('app/src/FoundrySpecification.lex.tex').includes('name: browserChatModeControlsBoundary,'));assert.ok(read('.github/workflows/studio.yml').includes('node tools/browser_chat_mode_controls_browser.mjs'));assert.ok(read('studio/tools/shell_parse.mjs').includes('browser-chat-modes.mjs'));
});
