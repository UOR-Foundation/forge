#!/usr/bin/env bash
set -euo pipefail
base=dfc09e61ac847c29a95183d471111d24dc24000d
patch_sha=39622a5999716778e8c1d3663f4d654f612d1f722d29ce1633e6cfeadc0d7a83
lock_sha=3773d32926962ef5d2556b74e0df9b34bdaf72353022f3256ebaa04a4ba8db7f
root=$PWD
patch=$root/job-inputs/diagnostics/template-model/preparation.patch
[[ -z ${ACTIONS_ID_TOKEN_REQUEST_URL:-} && -z ${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-} && -z ${PRISM_REGISTRY_TOKEN:-} && -z ${GITHUB_TOKEN:-} ]]
printf '%s  %s\n' "$patch_sha" "$patch" | sha256sum --check --strict
cd upstream
[[ $(git rev-parse HEAD) == "$base" ]]
[[ -z $(git status --porcelain) ]]
printf '%s  %s\n' "$lock_sha" prismpm.lock | sha256sum --check --strict
mkdir -p "$root/evidence/original" "$root/evidence/generated"
cp CONFORMANCE.md "$root/evidence/original/CONFORMANCE.md"
cp -r model "$root/evidence/original/model"
git apply --check "$patch"
git apply "$patch"
cp -r model "$root/evidence/generated/model"
# Record every source file before running the real generator. Only its declared
# output may change; Cargo's untracked build/cache directory is outside this set.
git ls-files --cached --others --exclude-standard -z | python3 -c 'import sys,hashlib,json; from pathlib import Path; names=sys.stdin.buffer.read().decode().split("\0"); print(json.dumps({n:hashlib.sha256(Path(n).read_bytes()).hexdigest() for n in names if n and n != "CONFORMANCE.md"},sort_keys=True))' > "$root/evidence/source-before.json"
image=$(python3 -c 'import json;print(json.load(open("prismpm.lock"))["sdk_image"])')
[[ "$image" == 'ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b47d7a370c4a26b8285f5e9c3bb15e639973c55505c3809ddbe55352fea58' ]]
# Public SDK pull only. No login, socket mount, signing, application registry,
# persisted credentials, publishing, security setting change or release command.
docker_config=$(mktemp -d "$RUNNER_TEMP/model-docker.XXXXXX")
trap 'rm -rf "$docker_config"' EXIT
printf '{}\n' > "$docker_config/config.json"
DOCKER_CONFIG="$docker_config" docker pull "$image"
DOCKER_CONFIG="$docker_config" docker image inspect "$image" --format '{{.Id}}' > "$root/evidence/sdk-image-id.txt"
DOCKER_CONFIG="$docker_config" docker run --rm \
  --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,exec,nosuid,size=2g \
  --volume "$PWD:$PWD" \
  --workdir "$PWD" \
  --env HOME=/tmp/prismpm-home \
  --env PRISMPM_EPHEMERAL_HOME=1 \
  "$image" bash -euo pipefail -c \
  'just model-write; cargo run -q --locked -p xtask -- check-model' \
  2>&1 | tee "$root/evidence/generator.log"
python3 - "$root/evidence/source-before.json" <<'PY'
import hashlib,json,sys
from pathlib import Path
for name,digest in json.load(open(sys.argv[1])).items():
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest, name
PY
# Verify the patch-added test/scenario files as well as all original tracked files.
git diff --binary > "$root/evidence/generated/tracked.diff"
cp CONFORMANCE.md "$root/evidence/generated/CONFORMANCE.md"
python3 - "$root" "$base" "$patch_sha" "$image" <<'PY'
import hashlib,json,os,subprocess,sys
from pathlib import Path
root,base,patch_sha,image=sys.argv[1:]
root=Path(root)
upstream=root/'upstream'
patch=root/'job-inputs/diagnostics/template-model/preparation.patch'
# Reverse-check the exact input patch: runtime and model inputs remain intact.
subprocess.run(['git','apply','--reverse','--check',str(patch)],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for rel in ['crates/conformance/tests/frame.rs','features/suites/frame.feature','site/worker.test.mjs']:
    assert (upstream/rel).is_file(), rel
out=root/'evidence'
receipt={'schema':'template-model-projection/1','template_commit':base,'foundry_job_commit':os.environ['GITHUB_SHA'],'run_id':os.environ['GITHUB_RUN_ID'],'run_attempt':os.environ['GITHUB_RUN_ATTEMPT'],'patch_sha256':patch_sha,'sdk_image':image,'sdk_lock_sha256':sha(upstream/'prismpm.lock'),'command':'just model-write','verification':'cargo run -q --locked -p xtask -- check-model','limits':'Model generation only; no runtime implementation, full acceptance, browser qualification, template publication, merge or deployment.','files':{str(p.relative_to(out)):sha(p) for p in sorted(out.rglob('*')) if p.is_file()}}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
PY
