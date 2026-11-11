import hashlib,json,os,sys
from pathlib import Path
root=Path.cwd(); out=root/'evidence'; assembly=root/'assembly'; out.mkdir(exist_ok=True)
errors=[]
record={'run_id':os.environ['GITHUB_RUN_ID'],'run_attempt':os.environ['GITHUB_RUN_ATTEMPT'],'job_commit':os.environ['GITHUB_SHA'],'files':{}}
for path in (assembly/'site').rglob('*') if (assembly/'site').exists() else []:
    if path.is_symlink() or path.name in ['warmup.json','runtime-keys.json']: errors.append(f'unsafe artifact {path}')
reports=sorted((assembly/'.lighthouseci').glob('lhr-*.json'))
traces=sorted(assembly.glob('*.trace.json')); devtools=sorted(assembly.glob('*.devtoolslog.json'))
for label,paths in [('Lighthouse reports',reports),('Chrome traces',traces),('DevTools logs',devtools)]:
    if len(paths)!=3: errors.append(f'expected exactly 3 {label}, got {len(paths)}')
if {p.name.removesuffix('.trace.json') for p in traces}!={p.name.removesuffix('.devtoolslog.json') for p in devtools}: errors.append('trace/DevTools pairs do not match')
if not (assembly/'.lighthouseci/assertion-results.json').is_file(): errors.append('missing Lighthouse assertion results')
measurements=[]
for p in reports:
    try:
        d=json.loads(p.read_text()); a=d['audits']
        if d.get('runtimeError'): raise ValueError(str(d['runtimeError']))
        if d['configSettings']['formFactor']!='mobile': raise ValueError('not mobile')
        if not p.with_suffix('.html').is_file(): raise ValueError('missing HTML report')
        resources={r['resourceType']:r for r in a['resource-summary']['details']['items']}
        values={key:a[key]['numericValue'] for key in ['total-blocking-time','largest-contentful-paint','first-contentful-paint','cumulative-layout-shift']}
        values.update({'scores':{key:d['categories'][key]['score'] for key in ['performance','accessibility','best-practices','seo']},'transfer_bytes':resources['total']['transferSize'],'request_count':resources['total']['requestCount'],'third_party_request_count':resources['third-party']['requestCount'],'third_party_transfer_bytes':resources['third-party']['transferSize']})
        measurements.append({'report':str(p.relative_to(root)),'fetch_time':d['fetchTime'],'final_url':d['finalUrl'],'measured':values})
    except (KeyError,ValueError,TypeError) as e: errors.append(f'incomplete report {p.name}: {e}')
if len({m['fetch_time'] for m in measurements})!=len(measurements): errors.append('duplicate measurement times')
if len({hashlib.sha256(p.read_bytes()).hexdigest() for p in traces})!=len(traces): errors.append('duplicate trace contents')
for p in traces+devtools:
    try:
        d=json.loads(p.read_text())
        if p in traces and not d.get('traceEvents'): raise ValueError('empty traceEvents')
        if p in devtools and (not isinstance(d,list) or not d): raise ValueError('empty DevTools log')
    except (ValueError,TypeError,AttributeError) as e: errors.append(f'incomplete trace {p.name}: {e}')
(out/'measurements.json').write_text(json.dumps({'measurements':measurements,'traces':[str(p.relative_to(root)) for p in traces],'devtools_logs':[str(p.relative_to(root)) for p in devtools],'evidence_complete':not errors,'errors':errors},indent=2)+'\n')
paths=[]
for base in [out,assembly/'site',assembly/'screens',assembly/'.lighthouseci']:
    if base.exists(): paths.extend(p for p in base.rglob('*') if p.is_file())
paths.extend(traces+devtools)
for p in sorted(set(paths)):
    if p!=out/'artifact-manifest.json': record['files'][str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
record['evidence_complete']=not errors; record['errors']=errors
(out/'artifact-manifest.json').write_text(json.dumps(record,indent=2)+'\n')
if errors:
    print('\n'.join(errors),file=sys.stderr); sys.exit(1)
print(json.dumps(measurements,indent=2))
