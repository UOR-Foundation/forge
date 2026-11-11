"""Evidence-validator regression using prior real reports; never a new measurement."""
import json,os,subprocess,sys,tempfile
from pathlib import Path
script=Path(__file__).with_name('finalize.py').resolve(); fixture=Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(dir=Path.cwd(),prefix='evidence-test-') as tmp:
    root=Path(tmp); assembly=root/'assembly'; (assembly/'.lighthouseci').mkdir(parents=True)
    for p in (fixture/'.lighthouseci').glob('*'):
        if p.is_file(): os.link(p,assembly/'.lighthouseci'/p.name)
    for pattern in ['*.trace.json','*.devtoolslog.json']:
        for p in fixture.glob(pattern): os.link(p,assembly/p.name)
    env={**os.environ,'GITHUB_SHA':'prior-report-regression-only','GITHUB_RUN_ID':'NOT-A-RUN','GITHUB_RUN_ATTEMPT':'0'}
    def run(): return subprocess.run([sys.executable,str(script)],cwd=root,env=env,capture_output=True,text=True)
    result=run(); assert result.returncode==0,result.stderr
    m=json.loads((root/'evidence/measurements.json').read_text()); assert len(m['measurements'])==3
    manifest=json.loads((root/'evidence/artifact-manifest.json').read_text())
    assert len([p for p in manifest['files'] if p.endswith('.trace.json')])==3
    assert len([p for p in manifest['files'] if p.endswith('.devtoolslog.json')])==3
    for pattern in ['*.trace.json','*.devtoolslog.json','.lighthouseci/lhr-*.json','.lighthouseci/lhr-*.html','.lighthouseci/assertion-results.json']:
        p=next(assembly.glob(pattern)); hidden=p.with_name(p.name+'.missing'); p.rename(hidden)
        result=run(); assert result.returncode!=0,pattern
        assert not json.loads((root/'evidence/artifact-manifest.json').read_text())['evidence_complete']
        hidden.rename(p)
    assert run().returncode==0
    print(json.dumps({'fixture':'prior failed diagnostic reports only','positive':'3 reports, trace pairs, values and hashes verified','negative':'missing report, HTML, trace, DevTools log and assertion results all fail','measured_fixture_values':m['measurements']},indent=2))
