#!/usr/bin/env node
// FA86 coordinates the existing SDK build and pin contracts. It is not a release gate.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPOSITORY = 'UOR-Foundation/foundry';
export const WORKFLOW = '.github/workflows/build.yml';
export const ISSUER = 'https://token.actions.githubusercontent.com';
const SELF = 'studio/tools/kernel_adoption.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const SDK = /^[a-z0-9.-]+(:[0-9]{1,5})?\/[a-z0-9./_-]+@sha256:[0-9a-f]{64}$/;
const MAX_ZIP = 128 * 1024 * 1024, MAX_FILE = 64 * 1024 * 1024, MAX_TOTAL = 512 * 1024 * 1024;
export class AdoptionError extends Error {
  constructor(code, message) { super(message); this.name = 'AdoptionError'; this.code = code; }
}
const refuse = (code, message) => { throw new AdoptionError(code, message); };
const requireThat = (value, code, message) => { if (!value) refuse(code, message); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const json = value => `${JSON.stringify(value, null, 2)}\n`;
function parse(bytes, name, code = 'adoptionArtifactInvalid') {
  try { return JSON.parse(String(bytes)); } catch { refuse(code, `${name} must be JSON`); }
}
function command(exe, args, cwd, encoding = 'utf8') {
  try { return execFileSync(exe, args, { cwd, encoding, maxBuffer: MAX_TOTAL, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { refuse('adoptionToolFailed', `${path.basename(exe)} ${args[0]} failed; inspect the tool locally (credentials are not echoed)`); }
}
const git = (cwd, args, encoding = 'utf8') => command('git', args, cwd, encoding);
function cleanPath(name) {
  return typeof name === 'string' && name.length > 0 && !/[\\\0:\r\n]/.test(name) && !name.startsWith('/') && name.split('/').every(p => p !== '' && p !== '.' && p !== '..');
}
function immutableSource(cwd, source) {
  requireThat(SHA.test(source), 'adoptionInputInvalid', 'source must be a full lowercase commit digest');
  requireThat(git(cwd, ['rev-parse', '--verify', `${source}^{commit}`]).trim() === source, 'adoptionInputInvalid', 'source is not a local commit');
}
const generated = name => /(^|\/)(\.prism|\.lexlean|\.lake|\.prism-proof)(\/|$)/.test(name) || name === '.prism-proof.log';
// The build cannot read an omitted repository subtree: only this complete workspace is mounted.
const workspacePath = name => !name.includes('/') || name.startsWith('app/') || name.startsWith('.cargo/');
export function inputIdentity(cwd, source) {
  immutableSource(cwd, source);
  const entries = git(cwd, ['ls-tree', '-r', '-z', source]).split('\0').filter(Boolean).map(row => {
    const m = /^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/.exec(row);
    requireThat(m && cleanPath(m[4]), 'adoptionInputInvalid', 'Git tree contains an unsafe path');
    return { mode: m[1], type: m[2], object: m[3], path: m[4] };
  });
  const selected = entries.filter(e => workspacePath(e.path));
  requireThat(selected.some(e => e.path === 'app/lexlean.toml'), 'adoptionInputInvalid', 'kernel adoption requires the app/ build contract');
  const descriptors = list => list.sort((a, b) => a.path.localeCompare(b.path, 'en')).map(e => {
    requireThat(e.type === 'blob' && ['100644', '100755'].includes(e.mode) && !generated(e.path), 'adoptionInputInvalid', `non-regular or generated input refused: ${e.path}`);
    const bytes = git(cwd, ['cat-file', 'blob', e.object], null);
    return { path: e.path, mode: e.mode, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const files = descriptors(selected);
  const contractEntries = [WORKFLOW, SELF].map(name => {
    const entry = entries.find(e => e.path === name);
    requireThat(entry, 'adoptionInputInvalid', `source lacks construction contract ${name}`);
    return entry;
  });
  const sdk = parse(git(cwd, ['show', `${source}:prismpm.lock`]), 'prismpm.lock', 'adoptionInputInvalid').sdk_image;
  requireThat(SDK.test(sdk), 'adoptionInputInvalid', 'prismpm.lock must select an immutable SDK');
  const closure = { schema: 'foundry/kernel-build-inputs/1', sdk, platform: 'linux/amd64', command: 'just app', files, contract: descriptors(contractEntries) };
  return { ...closure, digest: sha256(canonical(closure)), source, tree: git(cwd, ['rev-parse', `${source}^{tree}`]).trim() };
}
export function materialize(cwd, source, destination) {
  requireThat(git(cwd, ['rev-parse', 'HEAD']).trim() === source, 'adoptionInputInvalid', 'capture checkout must equal the attested event source');
  const inputs = inputIdentity(cwd, source);
  for (const file of inputs.contract) {
    const target = path.join(cwd, file.path), stat = fs.lstatSync(target);
    requireThat(stat.isFile() && !stat.isSymbolicLink() && sha256(fs.readFileSync(target)) === file.sha256 && (stat.mode & 0o111 ? '100755' : '100644') === file.mode, 'adoptionEvidenceStale', `executed construction contract differs from source: ${file.path}`);
  }
  requireThat(!fs.existsSync(destination), 'adoptionInputInvalid', 'build workspace must be new');
  fs.mkdirSync(destination, { recursive: true });
  for (const file of inputs.files) {
    const target = path.join(destination, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, git(cwd, ['show', `${source}:${file.path}`], null), { mode: file.mode === '100755' ? 0o755 : 0o644 });
  }
  checkWorkspace(destination, inputs);
  return inputs;
}
export function checkWorkspace(directory, inputs) {
  directory = path.resolve(directory);
  const declared = new Set(inputs.files.map(f => f.path));
  const output = name => ['app/.prism/', 'app/.lexlean/', 'app/.lake/', '.prism-proof/'].some(prefix => name.startsWith(prefix)) || name === '.prism-proof.log';
  const enumerate = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      requireThat(!entry.isSymbolicLink(), 'adoptionEvidenceStale', `workspace symlink refused: ${name}`);
      if (entry.isDirectory()) enumerate(path.join(dir, entry.name), name + '/');
      else requireThat(entry.isFile() && (declared.has(name) || output(name)), 'adoptionEvidenceStale', `undeclared workspace output refused: ${name}`);
    }
  };
  enumerate(directory);
  for (const file of inputs.files) {
    const target = path.join(directory, file.path);
    let stat;
    try { stat = fs.lstatSync(target); } catch { refuse('adoptionEvidenceStale', `materialized input disappeared: ${file.path}`); }
    requireThat(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o111 ? '100755' : '100644') === file.mode && sha256(fs.readFileSync(target)) === file.sha256 && stat.size === file.bytes, 'adoptionEvidenceStale', `materialized input changed: ${file.path}`);
    let parent = path.dirname(target);
    while (parent !== path.resolve(directory)) {
      requireThat(!fs.lstatSync(parent).isSymbolicLink(), 'adoptionEvidenceStale', 'materialized parent became a symlink');
      parent = path.dirname(parent);
    }
  }
}
export function validatePlan(plan) {
  requireThat(plan?.schema === 'foundry/kernel-adoption-plan/1' && plan.repository === REPOSITORY && SHA.test(plan.source) && SHA.test(plan.targetHead) && /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(plan.targetRef) && !plan.targetRef.includes('..') && !plan.targetRef.endsWith('/') && DIGEST.test(plan.inputs?.digest) && SDK.test(plan.inputs?.sdk) && plan.inputs.source === plan.source, 'adoptionInputInvalid', 'invalid exact-source adoption plan');
  return plan;
}
export function makePlan(cwd, requestedSource, targetRef = 'refs/heads/main', targetHead = requestedSource) {
  let source = requestedSource, inputs = inputIdentity(cwd, source);
  let receipt;
  try { receipt = JSON.parse(git(cwd, ['show', `${targetHead}:verification/kernel-reproduction.json`])); } catch { receipt = null; }
  // A committed receipt is only a candidate index, never proof. Recovery below rechecks
  // both original signed executions. Keep their actual source; never relabel provenance.
  if (receipt?.profile === 'foundry/component-reproduction/1' && receipt.buildInputDigest === inputs.digest) {
    requireThat(SHA.test(receipt.source), 'adoptionEvidenceStale', 'candidate receipt source is malformed');
    const prior = inputIdentity(cwd, receipt.source);
    requireThat(prior.digest === inputs.digest && prior.sdk === inputs.sdk && git(cwd, ['merge-base', receipt.source, targetHead]).trim() === receipt.source, 'adoptionEvidenceStale', 'candidate receipt inputs or source ancestry differ');
    source = receipt.source; inputs = prior;
  }
  return validatePlan({ schema: 'foundry/kernel-adoption-plan/1', repository: REPOSITORY, requestedSource, source, targetRef, targetHead, inputs, scope: 'Forge kernel component only; full release acceptance remains separate' });
}
export function checkRunArtifact(plan, run, artifact) {
  validatePlan(plan);
  requireThat(Number.isSafeInteger(run?.id) && run.id > 0 && run.head_sha === plan.source && run.path === WORKFLOW && run.head_repository?.full_name === REPOSITORY && run.status === 'completed' && run.conclusion === 'success' && ['push', 'workflow_dispatch'].includes(run.event), 'adoptionArtifactInvalid', 'run is not a successful exact-source build workflow execution');
  requireThat(Number.isSafeInteger(artifact?.id) && artifact.id > 0 && !artifact.expired && artifact.name === `prism-build-${plan.source}` && artifact.workflow_run?.id === run.id && artifact.workflow_run?.head_sha === plan.source && /^sha256:[0-9a-f]{64}$/.test(artifact.digest), 'adoptionArtifactInvalid', 'artifact identity, source, expiry or GitHub ZIP digest mismatch');
}
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function readZip(bytes) {
  const code = 'adoptionArtifactInvalid';
  try {
    requireThat(bytes.length <= MAX_ZIP && bytes.length >= 22, code, 'ZIP size is outside bounds');
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
    requireThat(end >= 0 && bytes.readUInt32LE(end + 4) === 0, code, 'ZIP end or disk layout invalid');
    const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12);
    requireThat(count > 0 && count < 10000 && count === bytes.readUInt16LE(end + 8) && start + size === end, code, 'ZIP directory is invalid or unbounded');
    let cursor = start, total = 0;
    const files = new Map(), names = new Set(), intervals = [];
    for (let n = 0; n < count; n++) {
      requireThat(bytes.readUInt32LE(cursor) === 0x02014b50, code, 'ZIP central header invalid');
      const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), crc = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), length = bytes.readUInt32LE(cursor + 24), nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), mode = bytes.readUInt32LE(cursor + 38) >>> 16, local = bytes.readUInt32LE(cursor + 42);
      const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength), name = rawName.toString('utf8');
      cursor += 46 + nameLength + extra + comment;
      const directory = name.endsWith('/'), normalized = directory ? name.slice(0, -1) : name;
      requireThat(cursor <= end && cleanPath(normalized) && Buffer.from(name).equals(rawName) && !names.has(normalized) && !((mode & 0o170000) === 0o120000) && !(flags & 1) && [0, 8].includes(method), code, 'ZIP duplicate, unsafe path, symlink, encryption or compression refused');
      names.add(normalized);
      requireThat(length <= MAX_FILE && length <= Math.max(1, compressed) * 1000 && (total += length) <= MAX_TOTAL && local < start && bytes.readUInt32LE(local) === 0x04034b50, code, 'ZIP entry is oversized or damaged');
      const localNameLength = bytes.readUInt16LE(local + 26), dataStart = local + 30 + localNameLength + bytes.readUInt16LE(local + 28), dataEnd = dataStart + compressed;
      requireThat(dataEnd <= start && bytes.readUInt16LE(local + 6) === flags && bytes.readUInt16LE(local + 8) === method && bytes.subarray(local + 30, local + 30 + localNameLength).equals(rawName) && !intervals.some(([a, b]) => local < b && dataEnd > a), code, 'ZIP local header differs or overlaps');
      intervals.push([local, dataEnd]);
      const content = method === 0 ? Buffer.from(bytes.subarray(dataStart, dataEnd)) : inflateRawSync(bytes.subarray(dataStart, dataEnd), { maxOutputLength: MAX_FILE });
      requireThat(content.length === length && crc32(content) === crc && (!directory || !length), code, 'ZIP size or CRC mismatch');
      if (!directory) files.set(name, content);
    }
    requireThat(cursor === end, code, 'ZIP central directory has trailing entries');
    for (const name of files.keys()) requireThat(![...files.keys()].some(p => p !== name && p.startsWith(`${name}/`)), code, 'ZIP file/directory collision');
    return files;
  } catch (error) { if (error instanceof AdoptionError) throw error; refuse(code, 'malformed or unbounded ZIP refused'); }
}
export function artifactManifest(files) {
  return { schema: 'foundry/signed-artifact-manifest/1', files: [...files].filter(([name]) => !['artifact-manifest.json', 'provenance.sigstore.json'].includes(name)).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, bytes]) => ({ path: name, bytes: bytes.length, sha256: sha256(bytes) })) };
}
export function checkManifest(files) {
  requireThat(files.has('artifact-manifest.json') && files.has('provenance.sigstore.json') && files.has('build-inputs.json') && files.has('build.json') && files.has('build/manifest.json'), 'adoptionArtifactInvalid', 'new signed artifact manifest and build inputs are mandatory');
  const manifest = parse(files.get('artifact-manifest.json'), 'artifact-manifest.json');
  requireThat(canonical(manifest) === canonical(artifactManifest(files)), 'adoptionArtifactInvalid', 'signed manifest does not cover exactly every artifact file');
  const buildManifest = parse(files.get('build/manifest.json'), 'build manifest');
  requireThat(buildManifest.schema === 'prismpm/build-manifest/1' && Array.isArray(buildManifest.files) && buildManifest.files.length > 0, 'adoptionArtifactInvalid', 'SDK build manifest is missing');
  const declared = new Set();
  for (const entry of buildManifest.files) {
    const bytes = files.get(`build/${entry.path}`);
    requireThat(cleanPath(entry.path) && !declared.has(entry.path) && bytes && bytes.length === entry.byte_length && sha256(bytes) === entry.sha256, 'adoptionArtifactInvalid', 'SDK manifest file differs, is missing or duplicated');
    declared.add(entry.path);
  }
  for (const name of files.keys()) if (name.startsWith('build/') && name !== 'build/manifest.json') requireThat(declared.has(name.slice(6)), 'adoptionArtifactInvalid', `SDK manifest omitted ${name}`);
  return manifest;
}
export function checkCompilerInputs(files, inputs) {
  const raw = files.get('build/application/lexlean-build-manifest.json');
  requireThat(raw, 'adoptionArtifactInvalid', 'compiler input manifest is missing');
  const manifest = parse(raw, 'compiler input manifest');
  requireThat(Array.isArray(manifest.inputs) && manifest.inputs.some(i => i.kind === 'source'), 'adoptionArtifactInvalid', 'compiler source manifest is empty');
  const seen = new Set();
  for (const input of manifest.inputs) if (['source', 'lock', 'project-config'].includes(input.kind)) {
    const name = `app/${input.path}`, expected = inputs.files.find(f => f.path === name);
    requireThat(cleanPath(input.path) && !seen.has(name) && expected && input.sha256 === expected.sha256 && input.byte_length === expected.bytes, 'adoptionEvidenceStale', 'compiler input differs from captured source bytes');
    seen.add(name);
  }
  requireThat(seen.has('app/lexlean.toml') && seen.has('app/lexlean.lock'), 'adoptionArtifactInvalid', 'compiler manifest omitted config or lock');
}
export function checkCertificate(result, plan, run, record, subjectDigest) {
  const cert = result?.signature?.certificate, statement = result?.statement;
  const expectedRef = `refs/heads/${run.head_branch}`, identity = `https://github.com/${REPOSITORY}/${WORKFLOW}@${expectedRef}`, invocation = `https://github.com/${REPOSITORY}/actions/runs/${run.id}/attempts/${run.run_attempt}`;
  requireThat(cert?.issuer === ISSUER && cert.subjectAlternativeName === identity && cert.sourceRepositoryURI === `https://github.com/${REPOSITORY}` && cert.sourceRepositoryDigest === plan.source && cert.buildSignerDigest === plan.source && cert.sourceRepositoryRef === expectedRef && cert.runnerEnvironment === 'github-hosted' && cert.runInvocationURI === invocation && result.verifiedTimestamps?.some(t => ['Tlog', 'TSA'].includes(t.type)), 'adoptionProvenanceInvalid', 'verified signer, source, issuer, hosted runner, invocation or timestamp differs');
  const definition = statement?.predicate?.buildDefinition, workflow = definition?.externalParameters?.workflow;
  requireThat(statement?.predicateType === 'https://slsa.dev/provenance/v1' && statement.subject?.some(s => s.digest?.sha256 === subjectDigest) && workflow?.repository === `https://github.com/${REPOSITORY}` && workflow.path === WORKFLOW && workflow.ref === expectedRef && definition.resolvedDependencies?.some(d => d.uri === `git+https://github.com/${REPOSITORY}@${expectedRef}` && d.digest?.gitCommit === plan.source) && statement.predicate.runDetails?.metadata?.invocationId === invocation, 'adoptionProvenanceInvalid', 'signed build definition or subject differs');
  requireThat(record.run_id === run.id && record.sha === plan.source && record.repository === REPOSITORY && record.workflow_ref === `${REPOSITORY}/${WORKFLOW}@${expectedRef}` && record.ref === expectedRef && record.event === run.event, 'adoptionProvenanceInvalid', 'signed build record does not identify this exact execution');
  return invocation;
}
export function compareReplicas(a, b) {
  requireThat(a.run.id !== b.run.id && a.artifact.id !== b.artifact.id && a.invocation !== b.invocation, 'adoptionIndependenceInvalid', 'two distinct runs, artifacts and signed invocations are required');
  requireThat(a.inputs.digest === b.inputs.digest && a.inputs.source === b.inputs.source && canonical(a.inputs) === canonical(b.inputs), 'adoptionEvidenceStale', 'replicas did not use the same complete inputs and exact source');
  requireThat(a.bytes.equals(b.bytes), 'adoptionIndependenceInvalid', 'independent signed builds differ in complete holo bytes');
  requireThat(a.vectors.total > 0 && a.vectors.total === b.vectors.total && a.vectors.passed === a.vectors.total && b.vectors.passed === b.vectors.total, 'adoptionAcceptanceFailed', 'every nonempty acceptance vector must replay in both archives');
}
export async function runtime(directory = path.join(ROOT, 'studio/tools/kernel-adoption/node_modules/prism-code')) {
  requireThat(fs.existsSync(path.join(directory, 'package.json')) && parse(fs.readFileSync(path.join(directory, 'package.json')), 'runtime package').version === '0.7.2', 'adoptionToolFailed', 'install the locked verifier with npm ci --prefix studio/tools/kernel-adoption --ignore-scripts');
  return { pc: await import(pathToFileURL(path.join(directory, 'src/index.mjs'))), remote: await import(pathToFileURL(path.join(directory, 'src/remote-github.mjs'))) };
}
function ghClient(cwd, executable = 'gh') {
  return {
    json: endpoint => parse(command(executable, ['api', endpoint], cwd), 'GitHub response', 'adoptionToolFailed'),
    bytes: endpoint => command(executable, ['api', endpoint], cwd, null),
    action: args => command(executable, args, cwd),
    verify: (file, bundle, source) => parse(command(executable, ['attestation', 'verify', file, '--bundle', bundle, '--repo', REPOSITORY, '--signer-workflow', `${REPOSITORY}/${WORKFLOW}`, '--source-digest', source, '--signer-digest', source, '--cert-oidc-issuer', ISSUER, '--deny-self-hosted-runners', '--format', 'json'], cwd), 'GitHub verification', 'adoptionProvenanceInvalid'),
  };
}
export async function verifyReplica(plan, run, artifact, zip, directory, client) {
  checkRunArtifact(plan, run, artifact);
  requireThat(sha256(zip) === artifact.digest.slice(7), 'adoptionArtifactInvalid', 'downloaded ZIP differs from the GitHub artifact digest');
  const files = readZip(zip), manifest = checkManifest(files), inputs = parse(files.get('build-inputs.json'), 'build inputs');
  requireThat(canonical(inputs) === canonical(plan.inputs), 'adoptionEvidenceStale', 'signed complete build inputs do not match the source plan');
  checkCompilerInputs(files, inputs);
  const { remote } = await runtime();
  let record;
  try { record = remote.checkRecord(files, { repo: { full: REPOSITORY }, sha: plan.source }); }
  catch { refuse('adoptionArtifactInvalid', 'remote build record does not match this repository and source'); }
  requireThat(record.project === 'app' && record.independent === true && record.inputs_digest === inputs.digest, 'adoptionIndependenceInvalid', 'build is not a fresh bounded-workspace construction');
  fs.mkdirSync(directory, { recursive: true });
  const bundlePath = path.join(directory, 'provenance.sigstore.json'), manifestPath = path.join(directory, 'artifact-manifest.json');
  fs.writeFileSync(bundlePath, files.get('provenance.sigstore.json')); fs.writeFileSync(manifestPath, files.get('artifact-manifest.json'));
  let invocation;
  const signatureFor = file => {
    let verified;
    try { verified = client.verify(file, bundlePath, plan.source); } catch { refuse('adoptionProvenanceInvalid', 'GitHub/Sigstore refused this signed artifact'); }
    requireThat(Array.isArray(verified) && verified.length === 1, 'adoptionProvenanceInvalid', 'one verified bundle is required');
    invocation = checkCertificate(verified[0].verificationResult, plan, run, record, sha256(fs.readFileSync(file)));
    return verified[0].verificationResult;
  };
  signatureFor(manifestPath);
  let result;
  try {
    result = await remote.verifyRemoteBuild(files, { cwd: directory, repo: { full: REPOSITORY }, sha: plan.source, runInfo: { id: run.id }, verifyBundle: async () => {
      const verified = signatureFor(path.join(directory, 'app/.prism/remote', plan.source, 'build', record.holo));
      return { identity: verified.signature.certificate.subjectAlternativeName, issuer: ISSUER, time: verified.verifiedTimestamps };
    } });
  } catch (error) { if (error instanceof AdoptionError) throw error; refuse('adoptionArtifactInvalid', 'prism-code refused the archive or its provenance'); }
  requireThat(result.exitCode === 0 && result.vectors.total > 0 && result.vectors.total === result.vectors.passed, 'adoptionAcceptanceFailed', 'actual prism-code check or exact acceptance replay failed');
  return { run, artifact, inputs, record, invocation, manifest, files, bytes: Buffer.from(files.get(`build/${record.holo}`)), fingerprint: result.fingerprint, vectors: result.vectors };
}
export function componentReceipt(plan, replicas) {
  const [a, b] = replicas; compareReplicas(a, b);
  return { profile: 'foundry/component-reproduction/1', scope: plan.scope, source: plan.source, sdk: plan.inputs.sdk, runs: replicas.map(r => r.run.id), artifacts: replicas.map(r => r.artifact.id), archiveSha256: sha256(a.bytes), archiveBytes: a.bytes.length, archiveFingerprint: a.fingerprint, acceptanceVectors: a.vectors.total, comparison: 'complete byte-for-byte equality from independent runners', provenance: 'GitHub CLI Sigstore verification with exact source, signer, repository, workflow, OIDC issuer, hosted runner and verified timestamp; signed complete artifact manifests; prism-code 0.7.2 archive check and acceptance replay.', bundles: ['kernel-reproduction.sigstore.json', 'kernel-reproduction-b.sigstore.json'], modelSha256: plan.inputs.files.find(f => f.path === 'app/src/FoundrySpecification.lex.tex')?.sha256 ?? null, artifactZipSha256: replicas.map(r => r.artifact.digest.slice(7)), buildInputDigest: plan.inputs.digest, sourceTree: plan.inputs.tree, invocations: replicas.map(r => r.invocation), releaseQualified: false, nextActions: ['Maintainer reviews the prepared archive, pin and signed evidence.', 'Authorized maintainer explicitly publishes using atomic expected-ref fast-forward comparison.', 'Run full exact-SDK acceptance and Studio, browser, performance and live deployment qualification separately.'] };
}
function save(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.tmp`, typeof data === 'string' || Buffer.isBuffer(data) ? data : json(data)); fs.renameSync(`${file}.tmp`, file); }
function targetHead(client, ref) { return client.json(`repos/${REPOSITORY}/git/ref/${ref.replace(/^refs\//, '')}`).object.sha; }
export function assertTarget(plan, actual) { requireThat(actual === plan.targetHead, 'adoptionTargetChanged', 'target advanced; create a new plan before any push'); }
export function publicationArguments(cwd, plan, head) {
  validatePlan(plan);
  requireThat(SHA.test(head), 'adoptionInputInvalid', 'publication needs an immutable prepared commit');
  requireThat(git(cwd, ['merge-base', plan.targetHead, head]).trim() === plan.targetHead, 'adoptionTargetChanged', 'publication would rewrite history; prepared head is not a descendant');
  // The lease is solely an atomic old-OID comparison. The ancestry proof above forbids
  // every non-fast-forward update; an arbitrary origin or pushurl is never consulted.
  return ['push', `--force-with-lease=${plan.targetRef}:${plan.targetHead}`, `https://github.com/${REPOSITORY}.git`, `${head}:${plan.targetRef}`];
}
export function guardedPush({ expected, head, readTarget, push }) {
  const before = readTarget();
  if (before === head) return { status: 'already-published', head };
  requireThat(before === expected, 'adoptionTargetChanged', 'target advanced before push');
  try { push(); } catch {
    let after;
    try { after = readTarget(); } catch { refuse('adoptionPushUncertain', 'push outcome unknown; do not retry until the remote target is read'); }
    if (after === head) return { status: 'published', head };
    refuse(after === expected ? 'adoptionPushUncertain' : 'adoptionTargetChanged', 'push did not confirm the intended target; no automatic retry');
  }
  let after;
  try { after = readTarget(); } catch { refuse('adoptionPushUncertain', 'push returned but the remote target could not be verified'); }
  requireThat(after === head, 'adoptionPushUncertain', 'remote target does not confirm the prepared commit');
  return { status: 'published', head };
}
function directoryFiles(directory, prefix = '') {
  const files = new Map();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name, file = path.join(directory, entry.name);
    requireThat(cleanPath(name) && !entry.isSymbolicLink(), 'adoptionArtifactInvalid', 'artifact directory contains an unsafe path or symlink');
    if (entry.isDirectory()) for (const pair of directoryFiles(file, name + '/')) files.set(...pair);
    else { requireThat(entry.isFile(), 'adoptionArtifactInvalid', 'artifact contains non-regular entry'); files.set(name, fs.readFileSync(file)); }
  }
  return files;
}
export async function kernelProjection(bytes, source) {
  const { pc } = await runtime();
  try {
    const parsed = pc.parseArchive(bytes);
    requireThat(parsed.footer === parsed.fingerprint, 'adoptionArtifactInvalid', 'archive footer differs');
    const app = await pc.loadArchive(bytes), acceptance = await app.acceptance();
    requireThat(acceptance.total > 0 && acceptance.passed === acceptance.total, 'adoptionAcceptanceFailed', 'nonempty exact acceptance replay failed');
    const guest = Buffer.from(pc.resolveArchive(parsed).guest.content), b64 = b => Buffer.from(b).toString('base64');
    const meta = { spec: 'hologram-forge/kernel/1', application: app.name, source, digest: `blake3:${parsed.fingerprint}`, guest: { path: 'kernel/guest.wasm', sha256: sha256(guest), bytes: guest.length }, limits: app.limits, vectors: app.vectors.map(v => [b64(v.request), b64(v.response)]) };
    return { guest, metadata: JSON.stringify(meta, null, 1) + '\n', pin: `${source}\nblake3:${parsed.fingerprint}\n` };
  } catch (error) { if (error instanceof AdoptionError) throw error; refuse('adoptionArtifactInvalid', 'prism-code refused the pinned archive'); }
}
function evidenceFiles(plan, replicas) {
  const files = new Map([['verification/kernel-reproduction.json', Buffer.from(json(componentReceipt(plan, replicas)))]]);
  for (let i = 0; i < 2; i++) {
    const suffix = i ? '-b' : '';
    for (const [input, output] of [['provenance.sigstore.json', `kernel-reproduction${suffix}.sigstore.json`], ['artifact-manifest.json', `kernel-reproduction${suffix}.manifest.json`], ['build.json', `kernel-reproduction${suffix}.build.json`], ['build-inputs.json', `kernel-reproduction${suffix}.inputs.json`]]) files.set(`verification/${output}`, replicas[i].files.get(input));
  }
  return files;
}
export async function prepareAdoption(cwd, plan, replicas, worktree) {
  validatePlan(plan); compareReplicas(...replicas);
  requireThat(inputIdentity(cwd, plan.targetHead).digest === plan.inputs.digest, 'adoptionEvidenceStale', 'target kernel inputs differ from the reproduced inputs');
  const files = evidenceFiles(plan, replicas), bytes = replicas[0].bytes;
  const read = name => { try { return git(cwd, ['show', `${plan.targetHead}:${name}`], null); } catch { return null; } };
  const currentPin = read('studio/KERNEL_REV')?.toString().split('\n')[0] ?? '';
  const match = new RegExp(`^https://raw\\.githubusercontent\\.com/${REPOSITORY}/([0-9a-f]{40})/studio/shell/kernel/kernel\\.holo$`).exec(currentPin);
  if (match && [...files].every(([name, data]) => read(name)?.equals(data))) {
    const archived = git(cwd, ['show', `${match[1]}:studio/shell/kernel/kernel.holo`], null);
    requireThat(archived.equals(bytes) && read('studio/shell/kernel/kernel.holo')?.equals(bytes), 'adoptionEvidenceStale', 'immutable pin URL or committed archive points to different bytes');
    requireThat(git(cwd, ['merge-base', match[1], plan.targetHead]).trim() === match[1], 'adoptionEvidenceStale', 'immutable archive commit is not in target history');
    const projection = await kernelProjection(bytes, currentPin);
    requireThat(read('studio/KERNEL_REV')?.equals(Buffer.from(projection.pin)) && read('studio/shell/kernel/kernel.json')?.equals(Buffer.from(projection.metadata)) && read('studio/shell/kernel/guest.wasm')?.equals(projection.guest), 'adoptionEvidenceStale', 'committed kernel projection is stale');
    return { status: 'current', head: plan.targetHead, archiveCommit: match[1] };
  }
  requireThat(!fs.existsSync(worktree), 'adoptionInputInvalid', 'preparation worktree already exists; inspect its saved result instead');
  const branch = `foundry/adoption/${plan.source.slice(0, 12)}-${sha256(worktree).slice(0, 12)}`;
  git(cwd, ['worktree', 'add', '-b', branch, worktree, plan.targetHead]);
  const stamp = Number(git(cwd, ['show', '-s', '--format=%ct', plan.targetHead]).trim());
  const commit = (message, seconds) => {
    try { execFileSync('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', message], { cwd: worktree, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: `${stamp + seconds} +0000`, GIT_COMMITTER_DATE: `${stamp + seconds} +0000` }, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { refuse('adoptionToolFailed', 'local archive/pin commit failed'); }
    return git(worktree, ['rev-parse', 'HEAD']).trim();
  };
  save(path.join(worktree, 'studio/shell/kernel/kernel.holo'), bytes);
  git(worktree, ['add', 'studio/shell/kernel/kernel.holo']);
  // If bytes are already archived, use that immutable commit rather than invent an empty archive.
  const changed = git(worktree, ['diff', '--cached', '--name-only']).trim();
  const archiveCommit = changed ? commit('Archive independently reproduced Forge kernel', 1) : plan.targetHead;
  const url = `https://raw.githubusercontent.com/${REPOSITORY}/${archiveCommit}/studio/shell/kernel/kernel.holo`;
  requireThat(git(worktree, ['show', `${archiveCommit}:studio/shell/kernel/kernel.holo`], null).equals(bytes), 'adoptionEvidenceStale', 'archive URL commit does not contain the verified bytes');
  const projection = await kernelProjection(bytes, url);
  files.set('studio/KERNEL_REV', Buffer.from(projection.pin)); files.set('studio/shell/kernel/kernel.json', Buffer.from(projection.metadata)); files.set('studio/shell/kernel/guest.wasm', projection.guest);
  for (const [name, data] of files) save(path.join(worktree, name), data);
  git(worktree, ['add', ...files.keys()]);
  const head = commit('Pin verified kernel archive and signed component reproduction evidence', 2);
  return { status: 'prepared', head, archiveCommit, branch, worktree, targetRef: plan.targetRef, targetHead: plan.targetHead, source: plan.source, buildInputDigest: plan.inputs.digest, releaseQualified: false };
}
async function recover(cwd, plan, state, client) {
  const artifacts = [];
  for (let page = 1; page <= 10; page++) {
    const runs = client.json(`repos/${REPOSITORY}/actions/workflows/build.yml/runs?head_sha=${plan.source}&per_page=100&page=${page}`).workflow_runs ?? [];
    for (const run of runs) if (run.head_sha === plan.source && run.status === 'completed' && run.conclusion === 'success' && run.path === WORKFLOW && ['push', 'workflow_dispatch'].includes(run.event)) {
      const list = client.json(`repos/${REPOSITORY}/actions/runs/${run.id}/artifacts?per_page=100`).artifacts ?? [];
      for (const artifact of list) if (artifact.name === `prism-build-${plan.source}` && !artifact.expired) artifacts.push({ run, artifact });
    }
    if (runs.length < 100) break;
  }
  artifacts.sort((a, b) => a.run.id - b.run.id);
  const replicas = [];
  for (const { run, artifact } of artifacts) {
    if (replicas.some(r => r.run.id === run.id || r.artifact.id === artifact.id)) continue;
    const zipPath = path.join(state, `${artifact.id}.zip`);
    let zip = fs.existsSync(zipPath) ? fs.readFileSync(zipPath) : null;
    if (!zip || sha256(zip) !== artifact.digest?.replace('sha256:', '')) { zip = client.bytes(`repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`); save(zipPath, zip); }
    replicas.push(await verifyReplica(plan, run, artifact, zip, path.join(state, `verified-${artifact.id}`), client));
    if (replicas.length === 2) break;
  }
  return replicas;
}
async function buildReplicas(cwd, plan, state, client) {
  assertTarget(plan, targetHead(client, plan.targetRef));
  requireThat(inputIdentity(cwd, plan.targetHead).digest === plan.inputs.digest, 'adoptionEvidenceStale', 'planned source differs from target build inputs');
  requireThat(git(cwd, ['merge-base', plan.source, plan.targetHead]).trim() === plan.source, 'adoptionInputInvalid', 'build source must belong to the explicitly selected target history');
  const journalPath = path.join(state, 'dispatch.json'), journal = fs.existsSync(journalPath) ? parse(fs.readFileSync(journalPath), 'dispatch journal') : { source: plan.source, refs: {} };
  requireThat(journal.source === plan.source, 'adoptionEvidenceStale', 'dispatch journal belongs to another source');
  for (const replica of ['a', 'b']) {
    const branch = `prism/build/reproduce-${plan.source}-${replica}`, ref = `refs/heads/${branch}`;
    // The collection endpoint permits a missing ref without treating a denied read as absence.
    const found = client.json(`repos/${REPOSITORY}/git/matching-refs/heads/${branch}`).find(r => r.ref === ref);
    if (found) requireThat(found.object.sha === plan.source, 'adoptionTargetChanged', 'immutable reproduction ref names different source');
    else { assertTarget(plan, targetHead(client, plan.targetRef)); client.action(['api', '-X', 'POST', `repos/${REPOSITORY}/git/refs`, '-f', `ref=${ref}`, '-f', `sha=${plan.source}`]); }
    const runs = client.json(`repos/${REPOSITORY}/actions/workflows/build.yml/runs?head_sha=${plan.source}&branch=${encodeURIComponent(branch)}&per_page=100`).workflow_runs ?? [];
    let existing = false;
    for (const r of runs.filter(r => r.head_sha === plan.source && r.head_branch === branch)) {
      if (r.status !== 'completed') { existing = true; break; }
      if (r.conclusion === 'success' && (client.json(`repos/${REPOSITORY}/actions/runs/${r.id}/artifacts?per_page=100`).artifacts ?? []).some(a => a.name === `prism-build-${plan.source}` && !a.expired)) { existing = true; break; }
    }
    if (existing) continue;
    requireThat(!journal.refs[branch], 'adoptionPushUncertain', 'prior dispatch outcome is unresolved or failed; inspect that run before requesting a new execution');
    journal.refs[branch] = 'dispatch-pending'; save(journalPath, journal);
    assertTarget(plan, targetHead(client, plan.targetRef));
    client.action(['workflow', 'run', 'build.yml', '--repo', REPOSITORY, '--ref', branch]);
    journal.refs[branch] = 'dispatched'; save(journalPath, journal);
  }
  const deadline = Date.now() + 55 * 60 * 1000;
  while (Date.now() < deadline) {
    const replicas = await recover(cwd, plan, state, client);
    if (replicas.length === 2) { compareReplicas(...replicas); return replicas; }
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  refuse('adoptionToolFailed', 'build wait elapsed; runs continue and can be recovered without duplicate dispatch');
}
export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    requireThat(['--mode', '--repo-dir', '--source', '--target', '--state', '--gh', '--workspace', '--out', '--inputs'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--') && !options[args[i]], 'adoptionInputInvalid', 'expected unique named options with values');
    options[args[i]] = args[i + 1];
  }
  const mode = options['--mode'] ?? 'plan', cwd = path.resolve(options['--repo-dir'] ?? ROOT), source = options['--source'] ?? git(cwd, ['rev-parse', 'HEAD']).trim();
  if (mode === 'capture') { requireThat(options['--workspace'] && options['--out'], 'adoptionInputInvalid', 'capture needs workspace and output'); const inputs = materialize(cwd, source, path.resolve(options['--workspace'])); save(options['--out'], inputs); return inputs; }
  if (mode === 'check-workspace') { requireThat(options['--workspace'] && options['--inputs'], 'adoptionInputInvalid', 'workspace check needs workspace and input manifest'); checkWorkspace(path.resolve(options['--workspace']), parse(fs.readFileSync(options['--inputs']), 'inputs')); return { status: 'inputs-unchanged' }; }
  if (mode === 'manifest') { requireThat(options['--out'], 'adoptionInputInvalid', 'manifest needs an artifact directory'); const out = path.resolve(options['--out']); save(path.join(out, 'artifact-manifest.json'), artifactManifest(directoryFiles(out))); return { status: 'manifested' }; }
  const target = options['--target'] ?? 'main', targetRef = `refs/heads/${target}`;
  git(cwd, ['check-ref-format', targetRef]);
  let targetLocal;
  try { targetLocal = git(cwd, ['rev-parse', '--verify', `${targetRef}^{commit}`]).trim(); }
  catch { targetLocal = git(cwd, ['rev-parse', '--verify', `refs/remotes/origin/${target}^{commit}`]).trim(); }
  const plan = makePlan(cwd, source, targetRef, targetLocal);
  if (mode === 'plan') return plan;
  requireThat(['build', 'prepare', 'publish'].includes(mode) && options['--state'], 'adoptionInputInvalid', 'explicit build, prepare or publish mode requires a durable state directory');
  const state = path.resolve(options['--state']);
  requireThat(state !== cwd && !state.startsWith(cwd + path.sep), 'adoptionInputInvalid', 'state and preparation must be outside the source checkout');
  const client = ghClient(cwd, options['--gh'] ?? 'gh');
  const savedPlan = path.join(state, 'plan.json');
  if (fs.existsSync(savedPlan)) requireThat(canonical(parse(fs.readFileSync(savedPlan), 'saved plan')) === canonical(plan), 'adoptionEvidenceStale', 'saved plan changed; choose a new state directory');
  else save(savedPlan, plan);
  if (mode === 'publish') {
    const prepared = parse(fs.readFileSync(path.join(state, 'prepared.json')), 'prepared result');
    requireThat(prepared.status === 'prepared' && prepared.targetHead === plan.targetHead && prepared.targetRef === plan.targetRef && prepared.source === plan.source && prepared.buildInputDigest === plan.inputs.digest && SHA.test(prepared.head), 'adoptionEvidenceStale', 'prepared result differs from the plan');
    // Re-verify all live evidence and reconstruct commits before trusting a writable journal.
    const replicas = await recover(cwd, plan, state, client);
    requireThat(replicas.length === 2, 'adoptionIndependenceInvalid', 'two signed replicas are required');
    const checkDir = path.join(state, `publish-check-${process.pid}`), checked = await prepareAdoption(cwd, plan, replicas, checkDir);
    requireThat(checked.head === prepared.head, 'adoptionEvidenceStale', 'prepared commit differs from deterministic verified preparation');
    const result = guardedPush({ expected: plan.targetHead, head: prepared.head, readTarget: () => targetHead(client, plan.targetRef), push: () => git(cwd, publicationArguments(cwd, plan, prepared.head)) });
    save(path.join(state, 'published.json'), result); return result;
  }
  assertTarget(plan, targetHead(client, plan.targetRef));
  let replicas = await recover(cwd, plan, state, client);
  if (replicas.length < 2 && mode === 'build') replicas = await buildReplicas(cwd, plan, state, client);
  requireThat(replicas.length === 2, 'adoptionIndependenceInvalid', 'two signed replicas are not available; explicit build mode can request them');
  compareReplicas(...replicas);
  if (mode === 'build') { save(path.join(state, 'receipt.json'), componentReceipt(plan, replicas)); return { status: 'reproduced', receipt: path.join(state, 'receipt.json'), releaseQualified: false }; }
  const preparedPath = path.join(state, 'prepared.json');
  const prior = fs.existsSync(preparedPath) ? parse(fs.readFileSync(preparedPath), 'prepared result') : null;
  if (prior?.status === 'prepared') {
    const recheckPlan = { ...plan, targetHead: prior.head };
    const result = await prepareAdoption(cwd, recheckPlan, replicas, path.join(state, 'repeat-unused'));
    requireThat(result.status === 'current', 'adoptionEvidenceStale', 'previous preparation is not current');
    return { ...prior, status: 'already-prepared' };
  }
  const prepared = await prepareAdoption(cwd, plan, replicas, path.join(state, 'prepared'));
  save(preparedPath, prepared); return prepared;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(json(result))).catch(error => { const code = error instanceof AdoptionError ? error.code : 'adoptionToolFailed'; process.stderr.write(json({ error: code, message: error instanceof AdoptionError ? error.message : 'unexpected tool failure; inspect local tools without disclosing credentials' })); process.exitCode = 1; });
}
