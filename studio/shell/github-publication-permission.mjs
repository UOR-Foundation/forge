// FoundrySpecification.githubPublicationPermissionBoundary: public writes need exact reviewed scope.
const messages={invalidPublicationPermission:'Invalid publication permission',publicationPermissionMissing:'Publication permission is required',publicationPermissionDenied:'Public publication declined',publicationPermissionExpired:'Public publication permission expired',publicationPermissionOffline:'Public publication is unavailable offline',publicationPermissionUnavailable:'Public publication permission is unavailable',publicationSourceChanged:'The approved rules changed; review the current source before publishing'};
export const publicationPermissionFailure=code=>Object.assign(new Error(messages[code]||messages.publicationPermissionUnavailable),{code:Object.hasOwn(messages,code)?code:'publicationPermissionUnavailable'});
export function describeGitHubPublication(input){
 try{
  if(!input||Object.keys(input).sort().join()!=='attestation,axioms,repository,source,spec,templateRepository')throw Error();
  const copied=structuredClone(input);
  if(typeof copied.repository!=='string'||!/^[-A-Za-z0-9]{1,39}\/prism-[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(copied.repository)||copied.templateRepository!=='UOR-Foundation/template'||!/^sha256:[a-f0-9]{64}$/.test(copied.source)||!copied.spec||copied.repository.split('/')[1]!=='prism-'+copied.spec.name)throw Error();
  const payload=JSON.stringify({spec:copied.spec,axioms:copied.axioms,attestation:copied.attestation},null,2),bytes=new TextEncoder().encode(payload).length;
  if(bytes>1024*1024)throw Error();return Object.freeze({repository:copied.repository,source:copied.source,templateRepository:copied.templateRepository,payload,bytes,live:`https://${copied.repository.split('/')[0].toLowerCase()}.github.io/${copied.repository.split('/')[1]}/`});
 }catch{throw publicationPermissionFailure('invalidPublicationPermission');}
}
export function authorizeGitHubPublication(input,{document=globalThis.document,online=()=>globalThis.navigator.onLine,signal,timeoutMs=300000,now=()=>Date.now()}={}){
 let disclosure;try{disclosure=describeGitHubPublication(input);if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw publicationPermissionFailure('invalidPublicationPermission');if(!online())throw publicationPermissionFailure('publicationPermissionOffline');if(signal?.aborted)throw Object.assign(Error('Publication was cancelled'),{code:'cancelled'});}catch(error){return Promise.reject(error);}
 return new Promise((resolve,reject)=>{
  let dialog,timer,settled=false;const previous=document?.activeElement,deadline=now()+timeoutMs;
  const close=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);dialog?.remove();previous?.focus?.();};
  const finish=error=>{if(settled)return;settled=true;close();if(error){reject(error);return;}const expires=now()+3600000;resolve(Object.freeze({check:async()=>{if(signal?.aborted)throw Object.assign(Error('Publication was cancelled'),{code:'cancelled'});if(now()>=expires)throw publicationPermissionFailure('publicationPermissionExpired');if(!online())throw publicationPermissionFailure('publicationPermissionOffline');},close}));};
  const abort=()=>finish(Object.assign(Error('Publication was cancelled'),{code:'cancelled'}));
  try{
   const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};dialog=el('dialog');dialog.setAttribute('aria-label','Review public GitHub publication');dialog.style.cssText='max-width:min(90vw,46rem);max-height:85vh;overflow:auto;padding:24px;border-radius:12px;color-scheme:light dark';
   dialog.append(el('h2',`Publish to ${disclosure.repository}?`),el('p',`Public site: ${disclosure.live}`),el('p',`Captured source: ${disclosure.source}`),el('p',`Template: ${disclosure.templateRepository}`),el('p','This uses your configured GitHub credential with api.github.com to create or update this public repository, enable Pages, and commit generated model, proof, workflow and page files. Anyone can read the published content. GitHub Actions usage applies to that account.'));
   const details=el('details'),summary=el('summary',`Exact model payload (${disclosure.bytes} UTF-8 bytes)`),pre=el('pre',disclosure.payload);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:20rem;overflow:auto';details.append(summary,pre);dialog.append(details,el('p','Approval covers this captured model only. Changes require renewed approval. Stop cancels browser requests; it cannot undo commits, hide already public content or guarantee that submitted builds stop.'));
   const deny=el('button',"Don't publish"),allow=el('button','Publish these rules');deny.type=allow.type='button';deny.autofocus=true;deny.addEventListener('click',()=>finish(publicationPermissionFailure('publicationPermissionDenied')));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(publicationPermissionFailure('publicationPermissionDenied'));});
   allow.addEventListener('click',()=>{if(now()>=deadline)finish(publicationPermissionFailure('publicationPermissionExpired'));else if(!online())finish(publicationPermissionFailure('publicationPermissionOffline'));else if(signal?.aborted)abort();else finish();});
   signal?.addEventListener('abort',abort,{once:true});dialog.append(deny,allow);document.body.append(dialog);timer=setTimeout(()=>finish(publicationPermissionFailure('publicationPermissionExpired')),timeoutMs);dialog.showModal();deny.focus();
  }catch{finish(publicationPermissionFailure('publicationPermissionUnavailable'));}
 });
}

export function bindPublicationSource(permission,expected,readCurrent){
 let prior,check,close;
 try{if(!expected||!/^sha256:[a-f0-9]{64}$/.test(expected.specKappa)||!['proved','published'].includes(expected.phase)||typeof readCurrent!=='function')throw Error();prior=JSON.stringify(structuredClone(expected));check=permission.check.bind(permission);close=permission.close.bind(permission);}catch{throw publicationPermissionFailure('invalidPublicationPermission');}
 return Object.freeze({close,check:async()=>{
  await check();let current;try{current=await readCurrent();}catch{throw publicationPermissionFailure('publicationPermissionUnavailable');}
  if(!current||JSON.stringify(current)!==prior)throw publicationPermissionFailure('publicationSourceChanged');
 }});
}
