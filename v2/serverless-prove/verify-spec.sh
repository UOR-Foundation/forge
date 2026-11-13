#!/usr/bin/env bash
# Runs `lexlean lock`, `lexlean check` and `lexlean verify` on spec/ in the pinned SDK image (prismpm.lock), on the
# Linux disk, and copies the results and the attestation back to spec/evidence/.
#   bash v2/serverless-prove/verify-spec.sh        (in WSL; about 2 to 4 minutes)
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$HOME/slp/spec
rm -rf "$work"; mkdir -p "$work"
cp -r "$here/spec/." "$work/"
rm -rf "$work/evidence" "$work/.lexlean"
cp "$here/../../prismpm.lock" "$work/prismpm.lock"
cp "$here/../probe-payment/build-local.sh" "$work/build-local.sh"
cd "$work"
cat > run.sh <<'INNER'
lexlean --version
lexlean lock; echo "lock exit $?"
lexlean check --all --diagnostic-format json > check.json; echo "check exit $?"
start=$(date +%s%N)
lexlean verify --diagnostic-format json > verify.json; echo "verify exit $?"
echo "verify ms $(( ($(date +%s%N) - start) / 1000000 ))"
INNER
bash build-local.sh "sh run.sh" > run.log 2>&1
mkdir -p "$here/spec/evidence"
cp run.log check.json verify.json lexlean.lock "$here/spec/evidence/"
att=$(find .lexlean -name attestation.json | head -1)
[ -n "$att" ] && cp "$att" "$here/spec/evidence/attestation.json"
cat run.log
