import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {GitHubApi, collectEvidence, reduceReadiness} from './release_readiness.mjs';
const fixture = name => JSON.parse(fs.readFileSync(new URL(`./fixtures/release-readiness/${name}.json`, import.meta.url)));
const baseline = () => fixture('qualified');
const policy = () => fixture('policy');
const codes = result => result.blockers.map(b => b.code);
const reject = (mutate, code, mutatePolicy = () => {}) => {
  const evidence = baseline(), captured = policy(); mutate(evidence); mutatePolicy(captured);
  evidence.rules_after = structuredClone(evidence.rules); evidence.reviews_after = structuredClone(evidence.reviews); evidence.threads_after = structuredClone(evidence.threads);
  const result = reduceReadiness(evidence, captured);
  assert.equal(result.machine_qualified, false); assert.ok(codes(result).includes(code), JSON.stringify(result.blockers));
};
test('FA85 exact captured source policy qualifies only report-only owner disposition', () => {
  const e = baseline(), p = policy(), original = structuredClone({e,p});
  const r = reduceReadiness(e,p);
  assert.equal(r.machine_qualified,true); assert.equal(r.release_authorized,false);
  assert.equal(r.action,'report_only'); assert.equal(r.disposition,'ready_for_owner_decision');
  assert.equal(r.independent_review.proven_by_collector,false);
  assert.equal(r.independent_review.status,'externally_attested');
  assert.deepEqual({e,p},original); assert.match(r.policy_sha256,/^[a-f0-9]{64}$/);
});
test('stale requested head refuses qualification', () => reject(e => e.request.head='d'.repeat(40),'readinessIdentityChanged',p=>p.head='d'.repeat(40)));
test('stale requested base refuses qualification', () => reject(e => e.request.base='d'.repeat(40),'readinessIdentityChanged',p=>p.base='d'.repeat(40)));
test('moved target during pagination refuses qualification', () => reject(e => e.after.target_sha='d'.repeat(40),'readinessIdentityChanged'));
test('moved source during pagination refuses qualification', () => reject(e => e.after.pr.head.sha='d'.repeat(40),'readinessIdentityChanged'));
test('moved default upstream during collection refuses qualification', () => reject(e => e.after.upstream_sha='d'.repeat(40),'readinessIdentityChanged'));
test('changed synthetic merge SHA refuses qualification', () => reject(e => e.after.pr.merge_commit_sha='d'.repeat(40),'readinessIdentityChanged'));
test('wrong merge execution SHA cannot substitute for exact merge evidence', () => reject(e => e.runs[0].head_sha=e.request.head,'readinessLaneMissing',p=>p.lanes[0].revision='merge'));
test('wrong synthetic merge parents refuse qualification', () => reject(e => e.merge_commit.parents.reverse(),'readinessIdentityChanged',p=>p.lanes[0].revision='merge'));
test('fork push green is historical evidence only', () => reject(e => {e.runs[0].event='push';e.runs[0].repository.full_name='contributor/foundry';},'readinessLaneMissing'));
test('upstream push cannot substitute for a pull request lane', () => reject(e => e.runs[0].event='push','readinessLaneMissing'));
test('stale run base cannot qualify the current source', () => reject(e => e.runs[0].pull_requests[0].base.sha='d'.repeat(40),'readinessLaneMissing'));
test('stale run head cannot qualify the current base', () => reject(e => e.runs[0].pull_requests[0].head.sha='d'.repeat(40),'readinessLaneMissing'));
test('green workflow name cannot substitute for pinned workflow path', () => reject(e => e.runs[0].path='.github/workflows/untrusted.yml','readinessLaneMissing'));
test('ambiguous distinct runs fail closed instead of choosing newest green', () => reject(e => e.runs.push({...structuredClone(e.runs[0]),id:22}),'readinessEvidenceAmbiguous'));
test('explicit captured run identity resolves duplicate workflow runs', () => {
  const e=baseline(),p=policy();e.runs.push({...structuredClone(e.runs[0]),id:22});p.lanes[0].run_id=21;
  assert.equal(reduceReadiness(e,p).machine_qualified,true);
});
for (const conclusion of ['skipped','cancelled','neutral','failure',null]) test(`required ${conclusion} job fails closed`, () => reject(e => e.runs[0].jobs[0].conclusion=conclusion,'readinessJobUnqualified'));
test('missing required job fails closed', () => reject(e => e.runs[0].jobs=[],'readinessJobUnqualified'));
test('ambiguous duplicate job names fail closed', () => reject(e => e.runs[0].jobs.push({...e.runs[0].jobs[0],id:52}),'readinessEvidenceAmbiguous'));
test('a check from another app cannot lend green evidence', () => reject(e => e.checks[0].app.id=999,'readinessJobUnqualified'));
test('a check from another suite cannot lend green evidence', () => reject(e => e.checks[0].check_suite.id=999,'readinessJobUnqualified'));
test('a stale check SHA cannot lend green evidence', () => reject(e => e.checks[0].head_sha='d'.repeat(40),'readinessJobUnqualified'));
test('unresolved review threads block qualification', () => reject(e => e.threads.push({id:'T1',isResolved:false,isOutdated:true,comments:{nodes:[{url:'https://github.com/UOR-Foundation/foundry/pull/70#discussion_r1'}]}}),'readinessThreadsUnresolved'));
test('unavailable thread evidence fails closed', () => reject(e => e.complete.threads=false,'readinessEvidenceUnavailable'));
test('unavailable reviews fail closed', () => reject(e => e.complete.reviews=false,'readinessEvidenceUnavailable'));
test('stale approval head fails closed', () => reject(e => e.reviews[0].commit_id='d'.repeat(40),'readinessReviewRequired'));
test('stale technical review base fails closed', () => reject(() => {},'readinessReviewRequired',p => p.review.technical_assessments[0].base='d'.repeat(40)));
test('GitHub approval does not synthesize independent substantive review', () => reject(() => {},'readinessReviewRequired',p => p.review.technical_assessments=[]));
test('self review cannot count as independent assessment', () => reject(e => e.before.pr.user.login=e.after.pr.user.login='reviewer','readinessReviewRequired'));
test('changed review body invalidates captured assessment', () => reject(e => e.reviews[0].body='LGTM','readinessReviewRequired'));
test('later changes requested supersede an old approval', () => reject(e => e.reviews.push({...e.reviews[0],id:12,state:'CHANGES_REQUESTED',submitted_at:'2026-11-12T08:30:00Z'}),'readinessReviewRequired'));
test('malformed or vacuous captured policy refuses qualification', () => {
  for (const mutate of [p=>p.lanes=[],p=>p.review.minimum_approvals=-1,p=>p.lanes[0].jobs=[],p=>p.lanes[0].repository='other/repo',p=>p.head='x']) reject(()=>{},'readinessPolicyInvalid',mutate);
});
test('exact source ancestor is integrated, not ready to remerge', () => {
  const e=baseline();e.ancestry.head_to_upstream={status:'ahead',base_commit:{sha:e.request.head},merge_base_commit:{sha:e.request.head}};
  const r=reduceReadiness(e,policy());assert.equal(r.stack.disposition,'exact_head_already_integrated');assert.equal(r.machine_qualified,false);
});
test('divergent source is not called integrated by similar filenames or title', () => {
  const e=baseline();e.ancestry.head_to_upstream.status='diverged';e.ancestry.base_to_head.status='diverged';
  assert.equal(reduceReadiness(e,policy()).stack.disposition,'divergent_requires_reconciliation');
});
test('recorded squash merge ancestry is distinct from source ancestry', () => {
  const e=baseline();e.before.pr.merged=e.after.pr.merged=true;e.before.pr.state=e.after.pr.state='closed';e.ancestry.head_to_upstream.status='diverged';
  e.ancestry.merge_to_upstream={status:'ahead',base_commit:{sha:e.before.pr.merge_commit_sha},merge_base_commit:{sha:e.before.pr.merge_commit_sha}};
  assert.equal(reduceReadiness(e,policy()).stack.disposition,'recorded_merge_already_integrated');
});
test('unavailable ancestry never implies similar source was integrated', () => reject(e => {delete e.ancestry.head_to_upstream;},'readinessAncestryUnknown'));
test('stack dependency preserves exact parent head and compare link', () => {
  const e=baseline();e.stack=[{number:69,head:e.request.base,base_ref:'main',url:'https://github.com/UOR-Foundation/foundry/pull/69',comparison:{status:'ahead',base_commit:{sha:e.request.base},merge_base_commit:{sha:e.request.base}}}];
  const r=reduceReadiness(e,policy());assert.equal(r.stack.dependencies[0].head,e.request.base);assert.equal(r.stack.dependencies[0].exact_ancestor,true);
});
const response = (body, next) => new Response(JSON.stringify(body),{headers:next?{link:`<https://api.github.com${next}>; rel="next"`}:{}});
test('REST pagination follows check, review and job pages', async () => {
  const pages=fixture('pages');
  for(const [kind,key] of [['checks','check_runs'],['reviews',null],['jobs','jobs']]){
    let calls=0;const api=new GitHubApi({fetch:async()=>response(pages[kind][calls++],calls===1?`/repos/UOR-Foundation/foundry/${kind}?page=2`:null)});
    assert.equal((await api.paginate(`/repos/UOR-Foundation/foundry/${kind}`,key)).length,2);assert.equal(calls,2);
  }
});
test('REST pagination refuses partial advertised totals', async () => {
  const api=new GitHubApi({fetch:async()=>response(fixture('pages').checks[0])});
  await assert.rejects(api.paginate('/repos/UOR-Foundation/foundry/checks','check_runs'),e=>e.code==='readinessEvidenceUnavailable');
});
test('REST pagination does not transmit credentials to foreign next links', async () => {
  let calls=0;const api=new GitHubApi({token:'never-leak',fetch:async()=>{calls++;return new Response('[]',{headers:{link:'<https://attacker.invalid/next>; rel="next"'}});}});
  await assert.rejects(api.paginate('/repos/UOR-Foundation/foundry/reviews'),e=>e.code==='readinessEvidenceUnavailable');assert.equal(calls,1);
});
test('REST pagination rejects loops instead of silently truncating', async () => {
  const api=new GitHubApi({fetch:async()=>response([], '/repos/UOR-Foundation/foundry/reviews')});
  await assert.rejects(api.paginate('/repos/UOR-Foundation/foundry/reviews'),e=>e.code==='readinessEvidenceUnavailable');
});
test('GraphQL paginates unresolved threads and refuses unavailable evidence', async () => {
  let calls=0;const api=new GitHubApi({fetch:async(_url,options)=>{
    const variables=JSON.parse(options.body).variables;assert.equal(variables.cursor,calls?'cursor1':null);
    return response({data:{repository:{pullRequest:{reviewThreads:{nodes:[{id:`T${calls}`,isResolved:!!calls}],pageInfo:{hasNextPage:!calls,endCursor:calls++?'cursor2':'cursor1'}}}}}});
  }});
  assert.equal((await api.threads('UOR-Foundation/foundry',70)).length,2);
  const denied=new GitHubApi({fetch:async()=>response({errors:[{message:'denied'}]})});
  await assert.rejects(denied.threads('UOR-Foundation/foundry',70),e=>e.code==='readinessEvidenceUnavailable');
});
test('collector records unavailable read rather than manufacturing empty evidence', async () => {
  const e=baseline();const api={sources:[],get:async path=>path.endsWith('/pulls/70')?e.before.pr:path.includes('/git/ref/')?{ref:'refs/heads/main',object:{sha:e.request.base}}:path.includes('/commits/')&&!path.includes('/check-runs')&&!path.includes('/statuses')?e.merge_commit:path.includes('/compare/')?e.ancestry.base_to_head:e.repository,paginate:async()=>[],threads:async()=>{throw Object.assign(new Error('denied'),{code:'readinessEvidenceUnavailable'});}};
  const collected=await collectEvidence(api,e.request);
  assert.equal(collected.complete.threads,false);assert.ok(collected.errors.length);assert.ok(codes(reduceReadiness(collected,policy())).includes('readinessEvidenceUnavailable'));
});
test('CLI offline replay emits JSON receipt and never mutates GitHub', () => {
  const result=spawnSync(process.execPath,[new URL('./release_readiness.mjs',import.meta.url).pathname,'--snapshot',new URL('./fixtures/release-readiness/qualified.json',import.meta.url).pathname,'--policy',new URL('./fixtures/release-readiness/policy.json',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).release_authorized,false);assert.match(result.stderr,/report.only/);
});

test('zero repository-required approvals does not invent an external approval gate', () => {
  const e=baseline(),p=policy();e.reviews=[];e.reviews_after=[];p.review.minimum_approvals=0;p.review.require_technical_assessment=false;p.review.technical_assessments=[];
  const r=reduceReadiness(e,p);assert.equal(r.machine_qualified,true);assert.equal(r.github_review.required_approvals,0);assert.equal(r.independent_review.status,'missing');assert.equal(r.owner_evidence.length,2);
});
test('historical PR base is retained but live target governs current qualification', () => {
  const e=baseline();e.before.pr.base.sha=e.after.pr.base.sha='d'.repeat(40);
  const r=reduceReadiness(e,policy());assert.equal(r.machine_qualified,true);assert.equal(r.identity.historical_pr_base,'d'.repeat(40));assert.equal(r.identity.live_base,e.request.base);
});
test('repository-required approvals cannot be weakened by captured policy', () => {
  const e=baseline(),p=policy();p.review.minimum_approvals=0;e.rules.effective=[{type:'pull_request',parameters:{required_approving_review_count:2}}];
  assert.ok(codes(reduceReadiness(e,p)).includes('readinessReviewRequired'));
});
test('observed review revocation during collection fails closed', () => {
  const e=baseline();e.reviews_after[0].state='DISMISSED';assert.ok(codes(reduceReadiness(e,policy())).includes('readinessIdentityChanged'));
});
test('observed thread changes during collection fail closed', () => {
  const e=baseline();e.threads_after.push({id:'new',isResolved:false});assert.ok(codes(reduceReadiness(e,policy())).includes('readinessIdentityChanged'));
});
test('source and suite registration cannot silently skip filter or replace the gate', () => {
  const source=fs.readFileSync(new URL('./release_readiness.test.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,new RegExp('\\b(?:test|it|describe)\\s*\\.\\s*(?:skip|todo|only)\\s*\\('));
  assert.doesNotMatch(source,new RegExp('skip'+'\\s*:\\s*true|todo'+'\\s*:\\s*true|only'+'\\s*:\\s*true'));
  assert.ok(source.includes("from './release_readiness.mjs'"));
  assert.equal(process.execArgv.some(arg=>arg.startsWith('--test-name-')||arg.startsWith('--test-skip-')),false);
});
test('a synthetic API merge SHA is not fabricated into executed-checkout proof', () => {
  const e=baseline(),p=policy();p.lanes[0].revision='merge';e.runs[0].head_sha=e.before.pr.merge_commit_sha;e.runs[0].jobs[0].head_sha=e.before.pr.merge_commit_sha;e.checks[0].head_sha=e.before.pr.merge_commit_sha;
  const r=reduceReadiness(e,p);assert.equal(r.machine_qualified,false);assert.equal(r.current_base_execution_qualified,false);assert.ok(r.blockers.some(b=>b.code==='readinessEvidenceUnavailable'&&b.message.includes('checkout execution')));
});
test('source-only metadata qualification never claims current-base execution', () => {
  const r=reduceReadiness(baseline(),policy());assert.equal(r.machine_qualified,true);assert.equal(r.qualification_scope,'upstream_source_metadata');assert.equal(r.current_base_execution_qualified,false);
});
test('required commit statuses bind creator, SHA and latest state', () => {
  const e=baseline(),p=policy();p.statuses=[{context:'external',creator_id:77,revision:'head'}];
  e.statuses=[{id:1,context:'external',creator:{id:77},observed_sha:e.request.head,state:'success',created_at:'2026-11-12T09:00:00Z'}];
  assert.equal(reduceReadiness(e,p).machine_qualified,true);
  for(const change of [s=>s.creator.id=78,s=>s.observed_sha='e'.repeat(40),s=>s.state='pending']){const v=structuredClone(e);change(v.statuses[0]);assert.ok(codes(reduceReadiness(v,p)).includes('readinessJobUnqualified'));}
  e.statuses.push({...e.statuses[0],id:2,state:'failure',created_at:'2026-11-12T09:01:00Z'});assert.ok(codes(reduceReadiness(e,p)).includes('readinessJobUnqualified'));
});
test('equally dated status observations are ambiguous', () => {
  const e=baseline(),p=policy();p.statuses=[{context:'external',creator_id:77,revision:'head'}];
  const status={context:'external',creator:{id:77},observed_sha:e.request.head,state:'success',created_at:'2026-11-12T09:00:00Z'};e.statuses=[{...status,id:1},{...status,id:2}];
  assert.ok(codes(reduceReadiness(e,p)).includes('readinessEvidenceAmbiguous'));
});
test('legacy protected branch without protection evidence is not unprotected', () => reject(e=>{e.rules.protected=true;e.rules.protection=null;},'readinessEvidenceUnavailable'));
test('required repository checks cannot be dropped from explicit lane policy', () => reject(e=>{e.rules.effective=[{type:'required_status_checks',parameters:{required_status_checks:[{context:'other',integration_id:15368}]}}];},'readinessJobUnqualified'));
test('code-owner approval is not inferred from an ordinary approval', () => reject(e=>{e.rules.effective=[{type:'pull_request',parameters:{require_code_owner_review:true}}];},'readinessEvidenceUnavailable'));
test('dismissed approval does not count and a later comment does not resurrect it', () => reject(e=>{e.reviews.push({...e.reviews[0],id:12,state:'DISMISSED',submitted_at:'2026-11-12T08:01:00Z'},{...e.reviews[0],id:13,state:'COMMENTED',submitted_at:'2026-11-12T08:02:00Z'});},'readinessReviewRequired'));
test('a later comment does not erase a prior changes-requested decision', () => reject(e=>{e.reviews[0].state='CHANGES_REQUESTED';e.reviews.push({...e.reviews[0],id:12,state:'COMMENTED',submitted_at:'2026-11-12T08:01:00Z'});},'readinessReviewRequired'));
test('missing repeated review capture fails closed', () => {const e=baseline();delete e.reviews_after;delete e.threads_after;assert.ok(codes(reduceReadiness(e,policy())).includes('readinessEvidenceUnavailable'));});
test('HTTP denial produces a typed sanitized error without credential disclosure', async () => {
  const token='SECRET-DO-NOT-REPEAT',api=new GitHubApi({token,fetch:async(_url,options)=>{assert.equal(options.headers.Authorization,`Bearer ${token}`);assert.equal(options.redirect,'error');return new Response(token,{status:403});}});
  await assert.rejects(api.get('/repos/UOR-Foundation/foundry'),e=>e.code==='readinessEvidenceUnavailable'&&!e.message.includes(token));assert.equal(JSON.stringify(api.sources).includes(token),false);
});
test('GraphQL pagination refuses a repeated cursor', async () => {
  const api=new GitHubApi({fetch:async()=>response({data:{repository:{pullRequest:{reviewThreads:{nodes:[],pageInfo:{hasNextPage:true,endCursor:'same'}}}}}})});
  await assert.rejects(api.threads('UOR-Foundation/foundry',70),e=>e.code==='readinessEvidenceUnavailable');
});
test('full collector uses paginated routes and second identity observations', async () => {
  const e=baseline(), calls=[];let prReads=0,reviewReads=0,threadReads=0;
  const api=new GitHubApi({fetch:async(url,options)=>{
    const u=new URL(url),path=u.pathname;calls.push(path+u.search);
    if(path==='/graphql'){threadReads++;return response({data:{repository:{pullRequest:{reviewThreads:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}}});}
    if(path.endsWith('/collaborators/reviewer/permission'))return response(e.reviewer_permissions.reviewer.evidence);
    if(path.endsWith('/pulls/70')){prReads++;return response(e.before.pr);}
    if(path.endsWith('/git/ref/heads/main'))return response({ref:'refs/heads/main',object:{sha:e.request.base}});
    if(path.endsWith('/rules/branches/main'))return response([]);
    if(path.endsWith('/branches/main'))return response({protected:false});
    if(path.endsWith('/check-runs'))return response({total_count:1,check_runs:path.includes(e.request.head)?e.checks:[]});
    if(path.endsWith('/statuses'))return response([]);
    if(path.endsWith('/actions/runs'))return response({total_count:u.searchParams.get('head_sha')===e.request.head?1:0,workflow_runs:u.searchParams.get('head_sha')===e.request.head?e.runs:[]});
    if(path.endsWith('/attempts/1/jobs'))return response({total_count:1,jobs:e.runs[0].jobs});
    if(path.endsWith('/reviews')){reviewReads++;return response(e.reviews);}
    if(path.endsWith('/pulls'))return response([]);
    if(path.includes('/compare/'))return response(path.endsWith(`${e.request.head}...${e.request.base}`)?e.ancestry.head_to_upstream:e.ancestry.base_to_head);
    if(path.includes('/commits/'))return response(e.merge_commit);
    if(path==='/repos/UOR-Foundation/foundry')return response(e.repository);
    throw new Error('unexpected fixture route '+path);
  }});
  // Correct total counts are part of each page, including empty SHA queries.
  const original=api.fetch;api.fetch=async(url,options)=>{const r=await original(url,options);if(new URL(url).pathname.endsWith('/check-runs')){const d=await r.json();d.total_count=d.check_runs.length;return response(d);}return r;};
  const collected=await collectEvidence(api,e.request);assert.deepEqual(collected.errors,[]);assert.equal(prReads,2);assert.equal(reviewReads,2);assert.equal(threadReads,2);assert.ok(calls.some(path=>path.includes('/attempts/1/jobs')));assert.equal(reduceReadiness(collected,policy()).machine_qualified,true);
});
test('invalid CLI invocation is typed and does not start API calls', () => {
  const result=spawnSync(process.execPath,[new URL('./release_readiness.mjs',import.meta.url).pathname,'--merge'],{encoding:'utf8'});
  assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).blockers[0].code,'readinessInputInvalid');
});
test('malformed required approval count cannot bypass repository policy', () => reject(e=>{e.rules.effective=[{type:'pull_request',parameters:{required_approving_review_count:'not-a-count'}}];},'readinessEvidenceUnavailable'));
test('unhandled required workflow rule fails closed', () => reject(e=>{e.rules.effective=[{type:'workflows',parameters:{workflows:[{path:'.github/workflows/security.yml'}]}}];},'readinessEvidenceUnavailable'));
test('missing live base ancestry fails closed', () => reject(e=>{delete e.ancestry.base_to_head;},'readinessAncestryUnknown'));
test('invalid live base ancestry fails closed', () => reject(e=>{e.ancestry.base_to_head.status='???';},'readinessAncestryUnknown'));
test('wrong upstream repository metadata fails closed', () => reject(e=>{e.repository.full_name='attacker/foundry';},'readinessIdentityChanged'));
test('missing workflow identity cannot match a missing job identity', () => reject(e=>{delete e.runs[0].id;delete e.runs[0].jobs[0].run_id;},'readinessEvidenceUnavailable'));
test('repository rules observed changing during collection fail closed', () => {
  const e=baseline();e.rules_after.effective.push({type:'pull_request',parameters:{required_approving_review_count:2}});assert.ok(codes(reduceReadiness(e,policy())).includes('readinessIdentityChanged'));
});
test('offline replay is explicitly marked as historical rather than a fresh live observation', () => {
  const result=spawnSync(process.execPath,[new URL('./release_readiness.mjs',import.meta.url).pathname,'--snapshot',new URL('./fixtures/release-readiness/qualified.json',import.meta.url).pathname,'--policy',new URL('./fixtures/release-readiness/policy.json',import.meta.url).pathname],{encoding:'utf8'});
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.collection_mode,'offline_replay');assert.equal(receipt.live_observation,false);assert.match(result.stderr,/offline_replay report-only/);
});
test('malformed evidence arrays and policy elements return typed failures instead of throwing', () => {
  for(const field of ['runs','checks','statuses','reviews','threads','stack'])reject(e=>{e[field]=[null];},'readinessEvidenceUnavailable');
  reject(()=>{},'readinessPolicyInvalid',p=>p.lanes=[null]);
});
test('missing required status rule list cannot silently become no requirements', () => reject(e=>{e.rules.effective=[{type:'required_status_checks',parameters:{}}];},'readinessEvidenceUnavailable'));
test('REST pagination covers workflow runs, statuses and open pull stacks', async () => {
  for(const [path,key] of [['actions/runs','workflow_runs'],['commits/abc/statuses',null],['pulls',null]]){
    let count=0;const api=new GitHubApi({fetch:async()=>{const entry={id:++count};return response(key?{total_count:2,[key]:[entry]}:[entry],count===1?`/repos/UOR-Foundation/foundry/${path}?page=2`:null);}});
    assert.deepEqual((await api.paginate(`/repos/UOR-Foundation/foundry/${path}`,key)).map(x=>x.id),[1,2]);
  }
});
test('missing workflow job collection is not an empty successful lane', () => reject(e=>{delete e.runs[0].jobs;},'readinessEvidenceUnavailable'));
test('approved outsider cannot satisfy repository-required approval count', () => reject(e=>{e.reviewer_permissions.reviewer.evidence.permission='read';},'readinessReviewRequired'));
test('unavailable reviewer eligibility fails closed when approvals are required', () => reject(e=>{delete e.reviewer_permissions;},'readinessEvidenceUnavailable'));
test('zero required approvals does not fabricate a blocking outside change request', () => {
  const e=baseline(),p=policy();p.review.minimum_approvals=0;p.review.require_technical_assessment=false;e.reviews[0].state='CHANGES_REQUESTED';e.reviews_after=structuredClone(e.reviews);e.reviewer_permissions.reviewer.evidence.permission='read';
  const r=reduceReadiness(e,p);assert.equal(r.machine_qualified,true);assert.ok(r.owner_evidence.some(x=>x.message.includes('requests changes')));
});
test('malformed review state or nonpositive identity fails even without an approval requirement', () => {
  for(const change of [review=>review.state='NOT_A_GITHUB_REVIEW_STATE',review=>review.id=0]){
    const e=baseline(),p=policy();p.review.minimum_approvals=0;p.review.require_technical_assessment=false;p.review.technical_assessments=[];change(e.reviews[0]);e.reviews_after=structuredClone(e.reviews);
    const r=reduceReadiness(e,p);assert.equal(r.machine_qualified,false);assert.ok(codes(r).includes('readinessEvidenceUnavailable'));
  }
});
