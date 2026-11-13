// FA-90: producer identity is retained across cache reuse; adoption is a separate source.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function refuse(code) { throw new Error(code); }
function git(args, cwd) {
  try { return execFileSync('git', args, {cwd, encoding:'utf8', maxBuffer:32*1024*1024}).trim(); }
  catch { refuse('pagesInvalidClaim'); }
}
function readClaim(file) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')); }
  catch { refuse('pagesInvalidClaim'); }
}
export function sourceInputs(source, cwd='.') {
  if (!revision(source)) refuse('pagesInvalidClaim');
  // NUL-delimited tree entries include mode, object kind, name and blob identity, not
  // working-tree outputs. This is a conservative superset of just app's inputs.
  const entries=git(['ls-tree','-rz','--full-tree',source],cwd).split('\0').filter(Boolean);
  const included=entries.filter(entry=>{
    const name=entry.slice(entry.indexOf('\t')+1);
    return (name === 'studio/tools/pages_source_binding.mjs' || !name.startsWith('studio/')) && !name.startsWith('v2/') &&
      (!name.startsWith('.github/workflows/') || name==='.github/workflows/pages.yml');
  });
  if (!included.length) refuse('pagesInvalidClaim');
  return sha(included.join('\0')+'\0');
}
export function createClaim(source, holo, fingerprint, cwd='.') {
  if (!revision(source)||!digest(fingerprint)) refuse('pagesInvalidClaim');
  return {schema:'foundry/pages-producer/1',source,inputs:sourceInputs(source,cwd),holo:sha(holo),fingerprint};
}
export function verifyClaim(claim,holo,adopted,cwd='.') {
  if (!claim || claim.schema!=='foundry/pages-producer/1' || !revision(claim.source) ||
    !digest(claim.inputs)||!digest(claim.holo)||!digest(claim.fingerprint)) refuse('pagesInvalidClaim');
  if (sha(holo)!==claim.holo) refuse('pagesArtifactMismatch');
  if (sourceInputs(claim.source,cwd)!==claim.inputs || sourceInputs(adopted,cwd)!==claim.inputs) refuse('pagesInputMismatch');
  return claim;
}
export function requireHead(trigger,checkedOut,remote) {
  if (![trigger,checkedOut,remote].every(revision) || trigger!==checkedOut || trigger!==remote) refuse('pagesStaleSource');
}
export function attestationArgs(file,source,repo) {
  if (!revision(source) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) refuse('pagesInvalidClaim');
  return ['attestation','verify',file,'--repo',repo,'--signer-workflow',`${repo}/.github/workflows/pages.yml`,'--source-digest',source,'--deny-self-hosted-runners'];
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const [mode,...args]=process.argv.slice(2);
 if (mode==='create') {
   const [holo,fingerprint,target]=args;
   fs.writeFileSync(target,JSON.stringify(createClaim(git(['rev-parse','HEAD'],'.'),fs.readFileSync(holo),fingerprint))+'\n');
 } else if (mode==='adopt') {
   const [dir,trigger,repo]=args;
   const head=git(['rev-parse','HEAD'],'.');
   const remote=git(['ls-remote',`https://github.com/${repo}.git`,'refs/heads/main'],'.').split('\t')[0];
   requireHead(trigger,head,remote);
   const file=`${dir}/producer.json`,holo=`${dir}/app.holo`;
   const claim=verifyClaim(readClaim(file),fs.readFileSync(holo),head);
   // Neither a cached manifest nor app.json is evidence until GitHub authenticates it.
   try {
     for (const subject of [file,holo]) execFileSync('gh',attestationArgs(subject,claim.source,repo),{stdio:'inherit'});
   } catch { refuse('pagesSignatureMismatch'); }
   fs.appendFileSync(process.env.GITHUB_ENV,`HOLO_PATH=${holo}\nHOLO_FINGERPRINT=${claim.fingerprint}\nPRODUCER_SOURCE=${claim.source}\nADOPTED_SOURCE=${head}\n`);
 } else refuse('pagesInvalidClaim');
}
