#!/usr/bin/env bash
# Runs a native checker on every input in a folder and writes one JSON object: sha -> {accepted, exit, ms, output}.
#   bash run-native.sh <checker> <inputs-dir> <out.json>
set -uo pipefail
checker=$1; inputs=$2; out=$3
echo "{" > "$out.partial"
first=1
for f in "$inputs"/*.ndjson; do
  sha=$(basename "$f" .ndjson)
  start=$(date +%s%N)
  text=$("$checker" "$f" 2>&1); code=$?
  ms=$(( ($(date +%s%N) - start) / 1000000 ))
  [ $first = 1 ] || echo "," >> "$out.partial"; first=0
  python3 -c 'import json,sys; print(json.dumps(sys.argv[1]) + ": " + json.dumps({"accepted": sys.argv[2] == "0", "exit": int(sys.argv[2]), "ms": int(sys.argv[3]), "output": sys.argv[4][-400:]}), end="")' "$sha" "$code" "$ms" "$text" >> "$out.partial"
  echo "${sha:0:12} exit $code ${ms} ms: $(echo "${text: -110}" | tr '\n' ' ')"
done
echo "}" >> "$out.partial"
mv "$out.partial" "$out"
