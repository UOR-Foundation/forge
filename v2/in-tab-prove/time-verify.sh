#!/usr/bin/env bash
# Runs `lexlean verify` on a staged project in the pinned SDK image with LexLean's own telemetry on, and keeps the
# verified directory (generated Lean, .olean files, attestation) beside the project for the export step.
#   bash v2/in-tab-prove/time-verify.sh <name staged by stage-project.sh> <entry module path>
set -euo pipefail
project=$HOME/itp/$1
cd "$project"
rm -rf .lexlean telemetry verified; mkdir telemetry
cat > run-verify.sh <<INNER
date +%s.%N
lexlean lock
date +%s.%N
LEXLEAN_CI_TELEMETRY=$project/telemetry lexlean verify $2 --diagnostic-format json > verify.json
echo "exit \$?"
date +%s.%N
INNER
chmod +x build-local.sh
./build-local.sh "sh run-verify.sh" > verify.log 2>&1 || true
cat verify.log
cut -c1-300 verify.json
cp -r .lexlean/verified/* verified
ls telemetry
