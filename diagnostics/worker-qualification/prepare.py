import base64,gzip,hashlib,io,json,os,subprocess,sys,tarfile
from pathlib import Path
root=Path.cwd(); inputs=root/'job-inputs/diagnostics/worker-qualification'; upstream=root/'upstream'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,value in json.loads((inputs/'inputs.json').read_text()).items():
    assert sha(inputs/name)==value,name
for key in ['ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN','PRISM_REGISTRY_TOKEN','GITHUB_TOKEN']:
    assert not os.environ.get(key),key
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=upstream,text=True).strip()=='dfc09e61ac847c29a95183d471111d24dc24000d'
assert not subprocess.check_output(['git','status','--porcelain'],cwd=upstream,text=True).strip()
subprocess.run(['git','apply','--check',str(inputs/'template.patch')],cwd=upstream,check=True)
subprocess.run(['git','apply',str(inputs/'template.patch')],cwd=upstream,check=True)
for name,value in json.loads((inputs/'reviewed-template.json').read_text()).items():
    assert sha(upstream/name)==value,name
out=root/'evidence'; out.mkdir(exist_ok=True)
(out/'inputs.json').write_bytes((inputs/'inputs.json').read_bytes())
(out/'reviewed-template.json').write_bytes((inputs/'reviewed-template.json').read_bytes())
if sys.argv[1]=='original':
    expected=json.loads((inputs/'original-site.json').read_text()); dest=root/'assembly/site'; dest.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(base64.b64decode((inputs/'original-site.tar.gz.b64').read_bytes()))),mode='r:') as tar:
        members=tar.getmembers()
        assert len(members)==len(expected) and {m.name for m in members}==set(expected)
        for m in members:
            assert m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
            p=dest/m.name; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(tar.extractfile(m).read())
            assert sha(p)==expected[m.name],m.name
    assert sha(dest/'app.holo')=='b7b116cd0f20bca62b598a51867bd20a01a91ca122769f791b9ae0201ce61e93'
