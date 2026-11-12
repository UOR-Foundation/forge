#!/usr/bin/env bash
# Whether Lake builds the staged runtime with Laws as .olean only (no C), and how long it takes.
set -euo pipefail
b=$(cd "$(dirname "$0")/.." && pwd)
image=$(sed -n 's/.*"sdk_image":"\([^"]*\)".*/\1/p' "$b/probe-app-copy/prismpm.lock")
docker run --rm --volume "$b/bench/laws-src:/src:ro" --env LEAN_NUM_THREADS=2 "$image" sh -c '
  mkdir /tmp/t && cp -r /src/. /tmp/t && cd /tmp/t
  for target in "LexLeanRuntime.Portable:olean LexLeanRuntime.Collections:olean LexLeanRuntime.Laws:olean" "PrismGenerated:olean"; do
    rm -rf .lake; s=$(date +%s)
    timeout 300 lake build $target 2>&1 | tail -4
    echo "target=[$target] exit=$? seconds=$(( $(date +%s) - s )) c_files=$(find .lake -name "*.c" | wc -l)"
  done
' >"$b/logs/olean-only.log" 2>&1
