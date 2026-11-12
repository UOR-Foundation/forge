#!/usr/bin/env bash
# Runs Lean 4.32.1's own kernel (official/, built by official/build.sh) on every input the tab checked in agree.mjs,
# and writes evidence/lean-kernel.json. Run in WSL after `node agree.mjs`; then run agree.mjs again to merge.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
kernel=$HOME/slp/official/.lake/build/bin/kernel
out=$here/evidence/lean-kernel.json
echo "{" > "$out.partial"
first=1
for f in "$here"/dist/assembled/*.ndjson; do
  sha=$(basename "$f" .ndjson)
  start=$(date +%s%N)
  text=$("$kernel" "$f" 2>&1); code=$?
  ms=$(( ($(date +%s%N) - start) / 1000000 ))
  [ $first = 1 ] || echo "," >> "$out.partial"; first=0
  python3 -c 'import json,sys; print(json.dumps(sys.argv[1]) + ": " + json.dumps({"accepted": sys.argv[2] == "0", "exit": int(sys.argv[2]), "ms": int(sys.argv[3]), "output": sys.argv[4][-600:]}), end="")' "$sha" "$code" "$ms" "$text" >> "$out.partial"
  echo "$sha exit $code ${ms} ms: ${text: -120}"
done
echo "}" >> "$out.partial"
mv "$out.partial" "$out"
