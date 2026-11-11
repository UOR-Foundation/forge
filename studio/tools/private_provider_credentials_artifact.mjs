// Negative acquisition control against the actual compiled projector and independent inventory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkStagedShell} from './check_shell_closure.mjs';
const studio=fileURLToPath(new URL('../',import.meta.url));
const executable=process.env.FOUNDRY_PROJECT_SHELL || path.join(studio,'core/target/release/project-shell');
assert.ok(fs.existsSync(executable),'Build the actual projector before testing credential artifacts');
const artifact=path.join(studio,'shell/warmup.json');assert.ok(!fs.existsSync(artifact),'The stage already contains a forbidden credential artifact');
try{
 fs.writeFileSync(artifact,'{"key":"synthetic-credential-never-a-real-key"}',{flag:'wx'});
 const result=spawnSync(executable,[],{cwd:studio,encoding:'utf8'});assert.notEqual(result.status,0);assert.ok((result.stdout+result.stderr).includes('providerCredentialArtifact'));assert.ok(!(result.stdout+result.stderr).includes('synthetic-credential-never-a-real-key'));
 await assert.rejects(checkStagedShell(path.join(studio,'shell')),{code:'providerCredentialArtifact'});
}finally{fs.rmSync(artifact);const restored=spawnSync(executable,[],{cwd:studio,encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);}
await checkStagedShell(path.join(studio,'shell'));
console.log(JSON.stringify({actualProjectorRefused:true,independentInventoryRefused:true,credentialNotPrinted:true,restoredClosure:true}));
