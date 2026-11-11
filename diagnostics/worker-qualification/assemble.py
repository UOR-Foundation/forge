import hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
root=Path.cwd(); source=root/'source'; assembly=root/'assembly'; out=root/'evidence'; variant=sys.argv[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected={'original':'d31bc32b12057c199a92141016775b43b086a473','candidate':'be93409042e8c80aa6ceebdd404295aca1aa9db8'}[variant]
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()==expected
if variant=='candidate':
    assert subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=source,text=True).strip()=='55cf1b224cd42bbc92a31e7b035da841a7fd12d8'
# The locked source remains unmodified. Only this labeled throwaway assembly
# receives reviewed proposed modules; no new Foundry frame.lock is asserted.
assembly.mkdir(exist_ok=True)
shutil.copytree(source/'bootstrap',assembly/'bootstrap')
shutil.copy(source/'lighthouserc.json',assembly/'lighthouserc.json')
if variant=='candidate':
    shutil.copytree(source/'try/vendor',assembly/'try/vendor')
    shutil.copytree(source/'app/src',assembly/'app/src')
    shutil.copytree(source/'site',assembly/'site')
    shutil.copytree(source/'try/vendor',assembly/'site/vendor',dirs_exist_ok=True)
    fixtures=assembly/'site/vendor/prism-code/fixtures'
    if fixtures.exists(): shutil.rmtree(fixtures)
    holos=list((source/'app/.prism/build').glob('*/*.holo')); assert len(holos)==1
    shutil.copy(holos[0],assembly/'site/app.holo')
    meta=json.loads((assembly/'site/app.json').read_text())
    ids=json.loads((holos[0].parent/'application/holo-identities.json').read_text())
    meta.setdefault('attestations',{})['build']={'id':ids['archive_fingerprint'],'url':f'https://github.com/UOR-Foundation/foundry/actions/runs/{os.environ["GITHUB_RUN_ID"]}','unsigned':True,'purpose':'isolated qualification only, not a signed attestation'}
    (assembly/'site/app.json').write_text(json.dumps(meta,indent=2)+'\n')
    (out/'holo-identities.json').write_text(json.dumps(ids,indent=2)+'\n')
for name in ['app.mjs','guest-worker.mjs']:
    shutil.copy(root/'upstream/site'/name,assembly/'site'/name)
assert sha(assembly/'lighthouserc.json')==sha(source/'lighthouserc.json')
record={'schema':'proposed-worker-qualification/1','variant':variant,'source_commit':expected,'template_base':'dfc09e61ac847c29a95183d471111d24dc24000d','reviewed_local_template_commit':'7b97c3b180a16cacd1abbbe40738be8142a4623b','foundry_job_commit':os.environ['GITHUB_SHA'],'run_id':os.environ['GITHUB_RUN_ID'],'run_attempt':os.environ['GITHUB_RUN_ATTEMPT'],'archive_sha256':sha(assembly/'site/app.holo'),'provenance':'original exact failed-run metadata' if variant=='original' else 'unsigned qualification build only','overlay':{n:sha(assembly/'site'/n) for n in ['app.mjs','guest-worker.mjs']},'lighthouse_config_sha256':sha(source/'lighthouserc.json'),'source_frame_lock_sha256':sha(source/'frame.lock'),'limits':'Not a template publication, imported Foundry lock, release or deployment. Only amd64 is qualified. Existing screen gate blocks service workers: offline recovery is not qualified.'}
(out/'qualification.json').write_text(json.dumps(record,indent=2)+'\n')
