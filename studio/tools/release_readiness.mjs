#!/usr/bin/env node
// FA85. The collector reads metadata only. Captured policy is an explicit input,
// not a policy discovered from contributor-controlled check names or PR prose.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const API = 'https://api.github.com';
const categories = ['identity','rules','checks','statuses','runs','jobs','reviews','threads','ancestry','stack'];
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fail = (code, message) => Object.assign(new Error(message), {code});
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const list = value => Array.isArray(value) ? value : [];
const repoUrl = repository => `https://github.com/${repository}`;
const required = (condition, message) => { if (!condition) throw fail('readinessEvidenceUnavailable', message); };

export class GitHubApi {
  constructor({token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN, fetch = globalThis.fetch} = {}) {
    this.token = token; this.fetch = fetch; this.sources = [];
  }
  async request(path, body) {
    const url = new URL(path, API);
    // A Link header must not redirect the credential to another origin. Do not
    // follow HTTP redirects either, even for a renamed repository.
    required(url.origin === API && !url.username && !url.password, 'Untrusted API pagination origin');
    const headers = {'Content-Type':'application/json','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'foundry-readiness/1'};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response;
    try {
      response = await this.fetch(url.href, {method:body ? 'POST' : 'GET', headers, redirect:'error', signal:AbortSignal.timeout(30000), ...(body ? {body:JSON.stringify(body)} : {})});
    } catch { throw fail('readinessEvidenceUnavailable', `GitHub read failed: ${url.pathname}`); }
    this.sources.push({url:url.href,status:response.status});
    required(response.ok, `GitHub read returned HTTP ${response.status}: ${url.pathname}`);
    let data;
    try { data = await response.json(); } catch { throw fail('readinessEvidenceUnavailable', `GitHub returned invalid JSON: ${url.pathname}`); }
    return {data, link:response.headers.get('link')};
  }
  async get(path) { return (await this.request(path)).data; }
  async paginate(path, key = null) {
    const result = [], seen = new Set(); let next = path, total;
    while (next) {
      const address = new URL(next, API).href;
      required(!seen.has(address), 'Pagination repeated a page'); seen.add(address);
      const {data,link} = await this.request(next);
      const page = key ? data?.[key] : data;
      required(Array.isArray(page), 'Missing paginated API array');
      if (data.total_count !== undefined) {
        required(Number.isSafeInteger(data.total_count) && data.total_count >= 0, 'Invalid pagination total');
        if (total !== undefined) required(total === data.total_count, 'Pagination changed its total');
        total = data.total_count;
      }
      result.push(...page);
      const links = link ? link.split(/,\s*(?=<)/) : [];
      const nextLinks = links.filter(item => /;\s*rel="next"/.test(item));
      required(nextLinks.length <= 1, 'Ambiguous next page');
      next = nextLinks[0]?.match(/^<([^>]+)>/)?.[1] || null;
      required(!nextLinks.length || next, 'Malformed pagination link');
      if (seen.size >= 10000) required(!next, 'Pagination safety bound reached; evidence incomplete');
    }
    required(total === undefined || total === result.length, 'Pagination did not collect advertised total');
    return result;
  }
  async threads(repository, number) {
    const [owner,name] = repository.split('/'); let cursor = null; const result = [], seen = new Set();
    do {
      const {data} = await this.request('/graphql', {
        query:'query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){nodes{id isResolved isOutdated comments(first:1){nodes{url}}} pageInfo{hasNextPage endCursor}}}}}',
        variables:{owner,name,number,cursor},
      });
      required(!data.errors?.length, 'Review-thread GraphQL evidence unavailable');
      const connection = data.data?.repository?.pullRequest?.reviewThreads;
      required(Array.isArray(connection?.nodes) && typeof connection?.pageInfo?.hasNextPage === 'boolean', 'Review-thread page missing');
      result.push(...connection.nodes);
      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
      required(!connection.pageInfo.hasNextPage || (typeof cursor === 'string' && cursor && !seen.has(cursor)), 'Review-thread pagination stalled');
      if (cursor) seen.add(cursor);
      if (seen.size >= 10000) required(!cursor, 'Review-thread pagination safety bound reached');
    } while (cursor);
    required(new Set(result.map(t=>t.id)).size === result.length, 'Duplicate review-thread evidence');
    return result;
  }
}

function validateRequest(request) {
  if (!request || !REPOSITORY.test(request.repository) || !Number.isSafeInteger(request.pr) || request.pr < 1 || !SHA.test(request.head) || !SHA.test(request.base))
    throw fail('readinessInputInvalid','Repository, positive PR number and full expected head/live-base SHAs are required');
}
function compareRecord(value) {
  // GitHub's comparison relation is authoritative even when its optional
  // commit/file listing is truncated. Never infer ancestry from that listing.
  return {status:value.status,base_commit:{sha:value.base_commit?.sha},merge_base_commit:{sha:value.merge_base_commit?.sha},ahead_by:value.ahead_by,behind_by:value.behind_by,html_url:value.html_url};
}
export async function collectEvidence(api, request) {
  validateRequest(request);
  const e = {schema:1,request:structuredClone(request),collected_at:new Date().toISOString(),complete:Object.fromEntries(categories.map(c=>[c,true])),errors:[],sources:[],runs:[],checks:[],statuses:[],reviews:[],threads:[],stack:[],ancestry:{}};
  const root = `/repos/${request.repository}`;
  async function capture(category, action, fallback = null) {
    try { return await action(); } catch (error) {
      e.complete[category] = false;
      e.errors.push({code:'readinessEvidenceUnavailable',category,message:error.code ? error.message : `${category} read failed`});
      return fallback;
    }
  }
  e.repository = await capture('identity',()=>api.get(root));
  const pr = await capture('identity',()=>api.get(`${root}/pulls/${request.pr}`));
  const targetRef = pr?.base?.ref, upstreamRef = e.repository?.default_branch;
  const readRef = ref => api.get(`${root}/git/ref/heads/${encodeURIComponent(ref)}`).then(v=>{required(v.ref === `refs/heads/${ref}` && SHA.test(v.object?.sha), 'Invalid branch ref evidence');return v.object.sha;});
  e.before = {pr,target_sha:targetRef ? await capture('identity',()=>readRef(targetRef)) : null,upstream_sha:upstreamRef ? await capture('identity',()=>readRef(upstreamRef)) : null};
  const readRules = async()=> {
      const branch = await api.get(`${root}/branches/${encodeURIComponent(targetRef)}`);
      required(typeof branch.protected === 'boolean','Branch protection state unavailable');
      const effective = await api.paginate(`${root}/rules/branches/${encodeURIComponent(targetRef)}?per_page=100`);
      const protection = branch.protected ? await api.get(`${root}/branches/${encodeURIComponent(targetRef)}/protection`) : null;
      return {branch:targetRef,protected:branch.protected,effective,protection};
  };
  if (targetRef) e.rules = await capture('rules',readRules);
  else e.complete.rules = false;
  const shas = [...new Set([request.head,pr?.merge_commit_sha].filter(v=>SHA.test(v)))];
  for (const sha of shas) {
    e.checks.push(...await capture('checks',()=>api.paginate(`${root}/commits/${sha}/check-runs?per_page=100&filter=all`,'check_runs'),[]));
    e.statuses.push(...(await capture('statuses',()=>api.paginate(`${root}/commits/${sha}/statuses?per_page=100`),[])).map(status=>({...status,observed_sha:sha})));
  }
  const repos = [...new Set([request.repository,pr?.head?.repo?.full_name].filter(Boolean))];
  for (const repository of repos) for (const sha of shas) {
    // A fork is evidence to classify, never an upstream lane. A missing fork
    // read is still visible but must not erase complete upstream observations.
    const runs = await capture('runs',()=>api.paginate(`/repos/${repository}/actions/runs?head_sha=${sha}&per_page=100`,'workflow_runs'),[]);
    for (const run of runs) {
      const jobs = await capture('jobs',()=>api.paginate(`/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,'jobs'),[]);
      e.runs.push({...run,observed_repository:repository,jobs});
    }
  }
  e.reviews = await capture('reviews',()=>api.paginate(`${root}/pulls/${request.pr}/reviews?per_page=100`),[]);
  e.threads = await capture('threads',()=>api.threads(request.repository,request.pr),[]);
  if (pr?.merge_commit_sha) e.merge_commit = await capture('ancestry',()=>api.get(`${root}/commits/${pr.merge_commit_sha}`));
  const compare = (from,to) => api.get(`${root}/compare/${from}...${to}`).then(compareRecord);
  if (e.before.upstream_sha) e.ancestry.head_to_upstream = await capture('ancestry',()=>compare(request.head,e.before.upstream_sha));
  e.ancestry.base_to_head = await capture('ancestry',()=>compare(request.base,request.head));
  if (pr?.merged && pr.merge_commit_sha && e.before.upstream_sha) e.ancestry.merge_to_upstream = await capture('ancestry',()=>compare(pr.merge_commit_sha,e.before.upstream_sha));
  const open = await capture('stack',()=>api.paginate(`${root}/pulls?state=open&per_page=100`),[]);
  for (const parent of open) if (parent.number !== request.pr && parent.head?.repo?.full_name === request.repository && parent.head.ref === targetRef) {
    e.stack.push({number:parent.number,head:parent.head.sha,base_ref:parent.base.ref,url:parent.html_url,comparison:await capture('stack',()=>compare(parent.head.sha,request.head))});
  }
  // A stable PR SHA alone does not mean an approval was not dismissed while
  // checks were collected. Repeat those reads and fail on observed changes.
  e.reviews_after = await capture('reviews',()=>api.paginate(`${root}/pulls/${request.pr}/reviews?per_page=100`),[]);
  e.threads_after = await capture('threads',()=>api.threads(request.repository,request.pr),[]);
  e.reviewer_permissions = {};
  for (const reviewer of new Set(e.reviews_after.filter(review=>['APPROVED','CHANGES_REQUESTED'].includes(review.state)).map(review=>review.user?.login).filter(Boolean))) {
    try {e.reviewer_permissions[reviewer] = {available:true,evidence:await api.get(`${root}/collaborators/${encodeURIComponent(reviewer)}/permission`)};}
    catch {e.reviewer_permissions[reviewer] = {available:false};}
  }
  e.rules_after = targetRef ? await capture('rules',readRules) : null;
  e.after = {pr:await capture('identity',()=>api.get(`${root}/pulls/${request.pr}`)),target_sha:targetRef ? await capture('identity',()=>readRef(targetRef)) : null,upstream_sha:upstreamRef ? await capture('identity',()=>readRef(upstreamRef)) : null};
  e.sources = structuredClone(api.sources || []);
  return e;
}

function validPolicy(p,r) {
  return p?.schema === 1 && p.repository === r.repository && p.pr === r.pr && p.head === r.head && p.base === r.base && typeof p.target_ref === 'string' && p.target_ref.length > 0 &&
    Array.isArray(p.lanes) && p.lanes.length > 0 && new Set(p.lanes.map(l=>l.id)).size === p.lanes.length && p.lanes.every(l=>
      typeof l.id === 'string' && l.id && l.repository === r.repository && /^\.github\/workflows\/[^/]+\.ya?ml$/.test(l.workflow_path) &&
      l.event === 'pull_request' && ['head','merge'].includes(l.revision) && Number.isSafeInteger(l.app_id) && l.app_id > 0 &&
      (l.run_id === undefined || Number.isSafeInteger(l.run_id) && l.run_id > 0) && Array.isArray(l.jobs) && l.jobs.length && new Set(l.jobs).size === l.jobs.length && l.jobs.every(j=>typeof j === 'string' && j.length)) &&
    Array.isArray(p.statuses) && p.statuses.every(s=>typeof s.context === 'string' && s.context && Number.isSafeInteger(s.creator_id) && s.creator_id > 0 && ['head','merge'].includes(s.revision)) &&
    p.review && Number.isSafeInteger(p.review.minimum_approvals) && p.review.minimum_approvals >= 0 && Array.isArray(p.review.trusted_reviewers) &&
    p.review.trusted_reviewers.every(r=>typeof r === 'string' && r.length) && (p.review.require_technical_assessment === undefined || typeof p.review.require_technical_assessment === 'boolean') && Array.isArray(p.review.technical_assessments);
}
function identity(pr) {
  return {number:pr?.number,head:pr?.head?.sha,head_repository:pr?.head?.repo?.full_name,head_ref:pr?.head?.ref,base:pr?.base?.sha,base_repository:pr?.base?.repo?.full_name,base_ref:pr?.base?.ref,merge:pr?.merge_commit_sha,state:pr?.state,merged:pr?.merged,draft:pr?.draft,author:pr?.user?.login};
}
const isAncestor = (comparison,head) => !!comparison && comparison.base_commit?.sha === head && ['ahead','identical'].includes(comparison.status) && comparison.merge_base_commit?.sha === head;

export function reduceReadiness(e, p) {
  const blockers = [], ownerEvidence = [];
  const add = (code,message,url,details) => blockers.push({code,message,...(url ? {url} : {}),...(details ? {details} : {})});
  const r = e?.request || {}, link = REPOSITORY.test(r.repository || '') ? `${repoUrl(r.repository)}/pull/${r.pr}` : undefined;
  let inputValid = true;
  try { validateRequest(r); } catch (error) {inputValid=false;add(error.code,error.message);}
  let capturedPolicyValid = false;
  try {capturedPolicyValid = inputValid && validPolicy(p,r);} catch {capturedPolicyValid = false;}
  if (!capturedPolicyValid) add('readinessPolicyInvalid','A nonempty, exact-identity qualification policy is required',link);
  const result = {schema:1,action:'report_only',release_authorized:false,machine_qualified:false,current_base_execution_qualified:false,qualification_scope:'upstream_source_metadata',disposition:'blocked',request:structuredClone(r),collected_at:e?.collected_at,policy:structuredClone(p ?? null),policy_sha256:digest(p ?? null),evidence_sha256:digest(e ?? null),blockers,owner_evidence:ownerEvidence,lanes:[],independent_review:{proven_by_collector:false,status:'missing',assessments:[]},stack:{disposition:'unknown',dependencies:[]},evidence:structuredClone(e ?? null)};
  if (!inputValid || !capturedPolicyValid) return result;
  const isRecord = value=>value !== null && typeof value === 'object' && !Array.isArray(value);
  let malformed = false;
  for (const field of ['runs','checks','statuses','reviews','threads','stack']) if (!Array.isArray(e[field]) || !e[field].every(isRecord)) {add('readinessEvidenceUnavailable',`Missing or malformed ${field} evidence array`,link);malformed=true;}
  if (malformed) return result;
  if (e.repository?.full_name !== r.repository || !e.repository?.default_branch) add('readinessIdentityChanged','Repository evidence does not identify the requested upstream',link);
  const pr = e.before?.pr, after = e.after?.pr, current = identity(pr), later = identity(after);
  result.identity = {expected_head:r.head,expected_live_base:r.base,observed:current,live_base:e.before?.target_sha,live_upstream:e.before?.upstream_sha,historical_pr_base:pr?.base?.sha,merge_sha:pr?.merge_commit_sha};
  for (const category of categories) if (e.complete?.[category] !== true) add('readinessEvidenceUnavailable',`${category} evidence is unavailable or incomplete`,link);
  for (const error of list(e.errors)) add('readinessEvidenceUnavailable',error.message,link,{category:error.category});
  if (typeof pr?.merged !== 'boolean' || typeof pr?.draft !== 'boolean' || !pr?.user?.login || !REPOSITORY.test(pr?.head?.repo?.full_name || '')) add('readinessEvidenceUnavailable','Incomplete PR identity metadata',link);
  if (e.schema !== 1 || !same(current,later) || current.number !== r.pr || current.head !== r.head || current.base_repository !== r.repository || current.base_ref !== p.target_ref || e.before?.target_sha !== r.base || e.after?.target_sha !== r.base || !SHA.test(e.before?.upstream_sha || '') || e.after?.upstream_sha !== e.before?.upstream_sha)
    add('readinessIdentityChanged','Expected head, live target branch, upstream or PR identity changed',link);
  if (!Array.isArray(e.reviews_after) || !Array.isArray(e.threads_after)) add('readinessEvidenceUnavailable','Repeated review/thread observations are missing',link);
  if (e.reviews_after && !same(e.reviews,e.reviews_after)) add('readinessIdentityChanged','Review evidence changed during collection',link);
  if (e.threads_after && !same(e.threads,e.threads_after)) add('readinessIdentityChanged','Review-thread evidence changed during collection',link);
  const merge = pr?.merge_commit_sha;
  if (p.lanes.some(l=>l.revision === 'merge') && (!SHA.test(merge || '') || e.merge_commit?.sha !== merge || !same(e.merge_commit?.parents?.map(v=>v.sha),[r.base,r.head])))
    add('readinessIdentityChanged','Synthetic merge does not have the exact live base and source parents',link);
  const relation = e.ancestry?.head_to_upstream;
  const baseRelation = e.ancestry?.base_to_head;
  if (!baseRelation || baseRelation.base_commit?.sha !== r.base || !SHA.test(baseRelation.merge_base_commit?.sha || '') || !['ahead','behind','identical','diverged'].includes(baseRelation.status)) add('readinessAncestryUnknown','Live target to source ancestry is unavailable or invalid',link);
  if (!relation || relation.base_commit?.sha !== r.head || !SHA.test(relation.merge_base_commit?.sha || '') || !['ahead','behind','identical','diverged'].includes(relation.status)) add('readinessAncestryUnknown','Exact source ancestry is unavailable',link);
  const integrated = isAncestor(relation,r.head), mergedIntegrated = pr?.merged && isAncestor(e.ancestry?.merge_to_upstream,merge);
  result.stack.disposition = integrated ? 'exact_head_already_integrated' : mergedIntegrated ? 'recorded_merge_already_integrated' : e.ancestry?.base_to_head?.status === 'diverged' ? 'divergent_requires_reconciliation' : relation ? 'not_integrated' : 'unknown';
  result.stack.dependencies = list(e.stack).map(parent=>({...parent,exact_ancestor:isAncestor(parent.comparison,parent.head)}));
  if (result.stack.disposition === 'not_integrated' && result.stack.dependencies.length) result.stack.disposition = 'stacked_on_open_pr';
  for (const parent of result.stack.dependencies) if (!parent.comparison) add('readinessAncestryUnknown',`Stack parent #${parent.number} ancestry is unavailable`,parent.url);
  for (const run of list(e.runs)) if (!Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || !Number.isSafeInteger(run.workflow_id) || run.workflow_id < 1 || !Number.isSafeInteger(run.check_suite_id) || run.check_suite_id < 1 || !SHA.test(run.head_sha || '') || !REPOSITORY.test(run.repository?.full_name || '') || !Array.isArray(run.jobs) || !Array.isArray(run.pull_requests)) add('readinessEvidenceUnavailable','Incomplete workflow run identity or attempt evidence',run.html_url || link);
  result.observed_runs = list(e.runs).map(run=>({id:run.id,attempt:run.run_attempt,repository:run.repository?.full_name,event:run.event,workflow_path:run.path,head_sha:run.head_sha,source_head_matches:run.head_sha === r.head,origin:run.repository?.full_name === r.repository ? 'upstream' : 'fork',pr_association:list(run.pull_requests).some(a=>a.number === r.pr && a.head?.sha === r.head && a.base?.sha === r.base && a.base?.ref === p.target_ref) ? 'exact_live_head_base' : 'missing_or_stale',status:run.status,conclusion:run.conclusion,url:run.html_url}));
  for (const lane of p.lanes) {
    const expectedSha = lane.revision === 'merge' ? merge : r.head;
    if (lane.revision === 'merge') add('readinessEvidenceUnavailable',`Lane ${lane.id} requires executed merge checkout evidence; GitHub run/job/check metadata and merge parents do not prove checkout execution`,link);
    const candidates = list(e.runs).filter(run=>run.repository?.full_name === lane.repository && run.head_repository?.full_name === pr?.head?.repo?.full_name && (!run.observed_repository || run.observed_repository === lane.repository) && run.path === lane.workflow_path && run.event === lane.event && run.head_sha === expectedSha &&
      (lane.run_id === undefined || run.id === lane.run_id) && list(run.pull_requests).some(association=>association.number === r.pr && association.head?.sha === r.head && association.base?.sha === r.base && association.base?.ref === p.target_ref));
    const record = {id:lane.id,event:lane.event,revision:lane.revision,expected_sha:expectedSha,qualified:false,candidates:candidates.map(run=>({id:run.id,attempt:run.run_attempt,url:run.html_url}))};result.lanes.push(record);
    if (!candidates.length) {add('readinessLaneMissing',`No exact upstream ${lane.id} lane for this live head/base`,link,{observed_runs:result.observed_runs.filter(run=>run.workflow_path === lane.workflow_path)});continue;}
    if (candidates.length !== 1) {add('readinessEvidenceAmbiguous',`Multiple exact ${lane.id} runs require an explicit captured run ID`,link);continue;}
    const run = candidates[0], initialCount = blockers.length;
    if (run.status !== 'completed' || run.conclusion !== 'success') add('readinessJobUnqualified',`${lane.id} workflow is not successful and complete`,run.html_url);
    for (const name of lane.jobs) {
      const jobs = list(run.jobs).filter(job=>job.name === name);
      if (jobs.length > 1) {add('readinessEvidenceAmbiguous',`Multiple ${lane.id}/${name} jobs in one attempt`,run.html_url);continue;}
      const job = jobs[0], checkId = Number(job?.check_run_url?.match(/\/check-runs\/(\d+)$/)?.[1]);
      const checks = list(e.checks).filter(check=>check.id === checkId);
      if (checks.length > 1) {add('readinessEvidenceAmbiguous',`Duplicate ${lane.id}/${name} check evidence`,job?.html_url);continue;}
      const check = checks[0];
      if (!job || !Number.isSafeInteger(job.id) || job.id < 1 || job.run_id !== run.id || job.run_attempt !== run.run_attempt || job.head_sha !== expectedSha || job.status !== 'completed' || job.conclusion !== 'success' || !check || check.head_sha !== expectedSha || check.check_suite?.id !== run.check_suite_id || check.app?.id !== lane.app_id || check.status !== 'completed' || check.conclusion !== 'success' || check.name !== name)
        add('readinessJobUnqualified',`Required ${lane.id}/${name} lacks exact successful job/check evidence`,job?.html_url || run.html_url);
    }
    record.qualified = lane.revision !== 'merge' && blockers.length === initialCount;
  }
  for (const status of list(e.statuses)) if (!Number.isSafeInteger(status.id) || status.id < 1 || !Number.isFinite(Date.parse(status.created_at))) add('readinessEvidenceUnavailable','Invalid commit-status identity or timestamp',link);
  for (const status of p.statuses) {
    const sha = status.revision === 'merge' ? merge : r.head;
    const matches = list(e.statuses).filter(s=>s.context === status.context && s.creator?.id === status.creator_id && s.observed_sha === sha).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    if (matches.length > 1 && matches[0].created_at === matches[1].created_at) add('readinessEvidenceAmbiguous',`Ambiguous ${status.context} status observations`,link);
    else if (!matches.length || matches[0].state !== 'success') add('readinessJobUnqualified',`Required ${status.context} status lacks an exact successful observation`,matches[0]?.target_url || link);
  }
  const rules = e.rules;
  if (!rules || rules.branch !== p.target_ref || !Array.isArray(rules.effective) || typeof rules.protected !== 'boolean' || (rules.protected && !rules.protection)) add('readinessEvidenceUnavailable','Effective repository review/check rules are unavailable',link);
  if (!e.rules_after || !same(rules,e.rules_after)) add('readinessIdentityChanged','Repository rules changed or their repeated capture is unavailable',link);
  for (const rule of list(rules?.effective)) {
    if (!['pull_request','required_status_checks'].includes(rule?.type)) add('readinessEvidenceUnavailable',`Required repository rule ${rule?.type || '(unknown)'} needs evidence beyond this collector`,link);
    if (!isRecord(rule?.parameters)) add('readinessEvidenceUnavailable','Malformed repository rule parameters',link);
  }
  const reviewRules = list(rules?.effective).filter(rule=>rule?.type === 'pull_request').map(rule=>rule.parameters || {});
  if (rules?.protection?.required_pull_request_reviews) reviewRules.push(rules.protection.required_pull_request_reviews);
  const validReviewRule = rule=>isRecord(rule) && (rule.required_approving_review_count === undefined || Number.isSafeInteger(rule.required_approving_review_count) && rule.required_approving_review_count >= 0) && ['require_code_owner_review','require_code_owner_reviews','require_last_push_approval','dismiss_stale_reviews','dismiss_stale_reviews_on_push','required_review_thread_resolution'].every(key=>rule[key] === undefined || typeof rule[key] === 'boolean');
  if (!reviewRules.every(validReviewRule)) add('readinessEvidenceUnavailable','Malformed repository-required review policy',link);
  const requiredApprovals = Math.max(p.review.minimum_approvals,...reviewRules.filter(validReviewRule).map(rule=>rule.required_approving_review_count || 0));
  if (reviewRules.some(rule=>rule?.require_code_owner_review || rule.require_code_owner_reviews || rule.require_last_push_approval)) add('readinessEvidenceUnavailable','Code-owner or last-pusher approval needs additional owner evidence; ordinary reviews cannot substitute',link);
  const statusRules = list(rules?.effective).filter(rule=>rule?.type === 'required_status_checks');
  if (statusRules.some(rule=>!Array.isArray(rule.parameters?.required_status_checks) || !rule.parameters.required_status_checks.every(isRecord))) add('readinessEvidenceUnavailable','Repository-required checks list is missing or malformed',link);
  const requiredChecks = statusRules.flatMap(rule=>list(rule.parameters?.required_status_checks).filter(isRecord).map(check=>({context:check.context,app_id:check.integration_id})));
  const legacy = rules?.protection?.required_status_checks;
  if (legacy && (!isRecord(legacy) || legacy.checks !== undefined && !Array.isArray(legacy.checks) || legacy.contexts !== undefined && !Array.isArray(legacy.contexts))) add('readinessEvidenceUnavailable','Malformed legacy required-check policy',link);
  requiredChecks.push(...(Array.isArray(legacy?.checks) ? legacy.checks : list(legacy?.contexts).map(context=>({context}))));
  for (const check of requiredChecks) {
    if (!check || typeof check.context !== 'string' || !check.context || !(check.app_id == null || Number.isSafeInteger(check.app_id) && check.app_id >= -1)) {add('readinessEvidenceUnavailable','Malformed repository-required check identity',link);continue;}
    // Required GitHub checks still need the explicit event/workflow/job policy;
    // names alone never introduce an additional trusted source.
    const authorized = p.lanes.some((lane,index)=>lane.jobs.includes(check.context) && (check.app_id == null || check.app_id === -1 || check.app_id === lane.app_id) && result.lanes[index].qualified);
    if (!authorized) add('readinessJobUnqualified',`Repository-required check ${check.context} is not covered by a qualified captured lane`,link);
  }
  const latest = new Map(), reviewIds = new Set();
  for (const review of list(e.reviews)) {
    if (!review.user?.login || !Number.isSafeInteger(review.id) || review.id < 1 || !['APPROVED','CHANGES_REQUESTED','COMMENTED','DISMISSED'].includes(review.state) || !Number.isFinite(Date.parse(review.submitted_at))) {add('readinessEvidenceUnavailable','Malformed review identity or timestamp',link);continue;}
    if (reviewIds.has(review.id)) {add('readinessEvidenceAmbiguous','Duplicate review identity',review.html_url);continue;}
    reviewIds.add(review.id);
    const previous = latest.get(review.user.login);
    if (previous && previous.id === review.id) {add('readinessEvidenceAmbiguous','Duplicate review identity',review.html_url);continue;}
    // COMMENTED does not dismiss a prior APPROVED/CHANGES_REQUESTED decision.
    if (review.state === 'COMMENTED') continue;
    if (!previous || Date.parse(review.submitted_at) > Date.parse(previous.submitted_at)) latest.set(review.user.login,review);
    else if (Date.parse(review.submitted_at) === Date.parse(previous.submitted_at)) add('readinessEvidenceAmbiguous','Review decisions have ambiguous ordering',review.html_url);
  }
  const eligibleReviewer = login=>{const permission=e.reviewer_permissions?.[login];return permission?.available === true && permission.evidence?.user?.login === login && ['admin','write'].includes(permission.evidence?.permission);};
  const submittedApprovals = [...latest.values()].filter(review=>review.state === 'APPROVED' && review.commit_id === r.head && review.user.login !== pr?.user?.login);
  const approvals = submittedApprovals.filter(review=>eligibleReviewer(review.user.login));
  result.github_review = {required_approvals:requiredApprovals,exact_head_approvals:approvals.map(review=>({id:review.id,reviewer:review.user.login,url:review.html_url})),ineligible_or_unverified_approvals:submittedApprovals.filter(review=>!eligibleReviewer(review.user.login)).map(review=>({id:review.id,reviewer:review.user.login,url:review.html_url})),quality_proven:false};
  if (approvals.length < requiredApprovals && submittedApprovals.some(review=>e.reviewer_permissions?.[review.user.login]?.available !== true)) add('readinessEvidenceUnavailable','Required reviewer repository eligibility is unavailable',link);
  if (approvals.length < requiredApprovals) add('readinessReviewRequired',`Need ${requiredApprovals} exact-head independent GitHub approval(s); observed ${approvals.length}`,link);
  for (const review of latest.values()) if (review.state === 'CHANGES_REQUESTED') {
    const item={code:'readinessReviewRequired',message:'A review still requests changes',url:review.html_url || link};
    if (requiredApprovals > 0 && (eligibleReviewer(review.user.login) || e.reviewer_permissions?.[review.user.login]?.available !== true)) blockers.push(item);
    else ownerEvidence.push(item);
  }
  const assessments = p.review.technical_assessments.filter(assessment=>{
    const review = list(e.reviews).find(review=>review.id === assessment.review_id);
    return review && p.review.trusted_reviewers.includes(review.user?.login) && review.user.login === assessment.reviewer && review.user.login !== pr?.user?.login && review.commit_id === r.head && assessment.head === r.head && assessment.base === r.base && typeof review.body === 'string' && review.body.trim().length > 0 && digest(review.body) === assessment.body_sha256 && review.html_url === assessment.url && ['APPROVED','COMMENTED'].includes(review.state) && !['DISMISSED','CHANGES_REQUESTED'].includes(latest.get(review.user.login)?.state);
  });
  result.independent_review = {proven_by_collector:false,status:assessments.length ? 'externally_attested' : 'missing',assessments:structuredClone(assessments)};
  if (!assessments.length) {
    const item = {code:'readinessReviewRequired',message:'No independently captured technical assessment matches the exact review body, source and live base',url:link};
    ownerEvidence.push(item);if (p.review.require_technical_assessment === true) blockers.push(item);
  }
  const threadIds = new Set();
  for (const thread of list(e.threads)) {
    if (typeof thread.id !== 'string' || !thread.id || threadIds.has(thread.id)) add('readinessEvidenceAmbiguous','Missing or duplicate review-thread identity',link);
    threadIds.add(thread.id);
    if (typeof thread.isResolved !== 'boolean') add('readinessEvidenceUnavailable','Review-thread resolution unavailable',link);
    else if (!thread.isResolved) add('readinessThreadsUnresolved','Unresolved review thread (including outdated threads)',thread.comments?.nodes?.[0]?.url || link,{id:thread.id});
  }
  ownerEvidence.push({code:'readinessEvidenceUnavailable',message:'Source metadata does not prove an executed checkout or current-base merge acceptance; no trusted checkout receipt was collected',url:link});
  if (pr?.draft || pr?.state !== 'open' || integrated || mergedIntegrated) ownerEvidence.push({code:'readinessIdentityChanged',message:'PR is draft, closed or already integrated; do not remerge it',url:link});
  result.machine_qualified = blockers.length === 0 && !pr?.draft && pr?.state === 'open' && !integrated && !mergedIntegrated;
  result.disposition = integrated || mergedIntegrated ? result.stack.disposition : result.machine_qualified ? 'ready_for_owner_decision' : 'blocked';
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i=0;i<argv.length;i+=2) {
    if (!['--repo','--pr','--head','--base','--policy','--output','--snapshot'].includes(argv[i]) || !argv[i+1] || Object.hasOwn(args,argv[i])) throw fail('readinessInputInvalid','Usage: --repo OWNER/REPO --pr N --head SHA --base LIVE_SHA --policy FILE [--output FILE], or --snapshot FILE --policy FILE');
    args[argv[i]] = argv[i+1];
  }
  if (!args['--policy']) throw fail('readinessInputInvalid','An explicit captured --policy FILE is required');
  let policy, evidence;
  try {
    policy = JSON.parse(fs.readFileSync(args['--policy'],'utf8'));
    if (args['--snapshot']) evidence = JSON.parse(fs.readFileSync(args['--snapshot'],'utf8'));
  } catch { throw fail('readinessInputInvalid','Cannot read policy or evidence JSON'); }
  if (evidence && ['--repo','--pr','--head','--base'].some(key=>args[key] !== undefined)) throw fail('readinessInputInvalid','Replay uses snapshot identity; do not supply conflicting live identity flags');
  if (!evidence) evidence = await collectEvidence(new GitHubApi(),{repository:args['--repo'],pr:Number(args['--pr']),head:args['--head'],base:args['--base']});
  const receipt = reduceReadiness(evidence,policy);
  receipt.live_observation = !args['--snapshot'];
  receipt.collection_mode = args['--snapshot'] ? 'offline_replay' : 'live_read';
  const json = JSON.stringify(receipt,null,2)+'\n';
  if (args['--output']) {
    try {fs.writeFileSync(args['--output'],json,{flag:'wx',mode:0o600});} catch {throw fail('readinessInputInvalid','Cannot create output receipt (existing files are not overwritten)');}
  } else process.stdout.write(json);
  process.stderr.write(`${receipt.collection_mode} report-only: ${receipt.disposition}; machine_qualified=${receipt.machine_qualified}; stack=${receipt.stack.disposition}\n`);
  for (const blocker of receipt.blockers) process.stderr.write(`${blocker.code}: ${blocker.message}${blocker.url ? ` (${blocker.url})` : ''}\n`);
  for (const run of receipt.observed_runs || []) process.stderr.write(`observed: ${run.origin} ${run.event} ${run.workflow_path} run=${run.id} source_head_matches=${run.source_head_matches} association=${run.pr_association} ${run.conclusion || run.status} (${run.url})\n`);
  for (const parent of receipt.stack.dependencies) process.stderr.write(`dependency: #${parent.number} head=${parent.head} exact_ancestor=${parent.exact_ancestor} (${parent.url})\n`);
  for (const item of receipt.owner_evidence) process.stderr.write(`owner evidence: ${item.message}\n`);
  process.exitCode = receipt.machine_qualified ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error=>{
  process.stdout.write(JSON.stringify({schema:1,action:'report_only',release_authorized:false,machine_qualified:false,blockers:[{code:error.code || 'readinessEvidenceUnavailable',message:error.code ? error.message : 'Readiness collection failed'}]})+'\n');process.exitCode=2;
});
