#!/usr/bin/env bash
# `lexlean verify` elaborates into a staging tree and deletes the Lean sources of the runtime library and every
# .olean.private and .olean.server before it publishes. The proof terms are in those private parts. This runs verify
# in the pinned SDK image and copies the staging tree while the replay stage is reading it, so the export is taken
# from the image's own elaboration and not from a second one.
#   bash v2/in-tab-prove/capture-staging.sh <name> <entry module path> <last module's olean path under oleans/>
set -euo pipefail
project=$HOME/itp/$1
cd "$project"
rm -rf .lexlean staging; chmod +x build-local.sh
./build-local.sh "lexlean lock && lexlean verify $2 --diagnostic-format json > verify.json; echo exit \$?" > verify.log 2>&1 &
job=$!
while kill -0 $job 2>/dev/null; do
  found=$(find .lexlean -path "*oleans/$3.private" 2>/dev/null | head -1 || true)
  if [ -n "$found" ] && [ ! -d staging ]; then
    sleep 3
    root=${found%/oleans/$3.private}
    cp -r "$root" staging.partial && mv staging.partial staging
    echo "captured $root"
  fi
  sleep 1
done
wait $job || true
cat verify.log; cut -c1-200 verify.json
find staging -maxdepth 2 | head -30
