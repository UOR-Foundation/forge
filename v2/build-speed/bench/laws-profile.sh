#!/usr/bin/env bash
# Times Laws.lean compiled alone in the pinned SDK image, with Lean's profiler on.
# Usage (inside WSL): bench/laws-profile.sh <label> [extra lean args]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
label=$1; shift || true
image=$(sed -n 's/.*"sdk_image":"\([^"]*\)".*/\1/p' "$here/../probe-app-copy/prismpm.lock")
log="$here/../logs/laws-$label.log"
{
  echo "label=$label image=$image start=$(date -u +%FT%TZ) extra=[$*]"
  echo "load before: $(cat /proc/loadavg)"
  docker run --rm --volume "$here/laws-src:/src:ro" --env EXTRA="$*" "$image" sh -c '
    set -e
    ms() { echo $(( $(date +%s%N) / 1000000 )); }
    mkdir /tmp/t && cp -r /src/. /tmp/t && cd /tmp/t
    s=$(ms); lake build LexLeanRuntime.Portable LexLeanRuntime.Collections >/dev/null 2>&1
    echo "portable+collections ms: $(( $(ms) - s ))"
    s=$(ms)
    set +e
    lake env lean $EXTRA -Dprofiler=true -Dprofiler.threshold=200 LexLeanRuntime/Laws.lean -o /tmp/Laws.olean > /tmp/out.txt 2>&1 &
    pid=$!
    peak=0
    while kill -0 $pid 2>/dev/null; do
      for p in $(pgrep -f "Laws.lean"); do
        h=$(sed -n "s/VmHWM:[^0-9]*\([0-9]*\).*/\1/p" /proc/$p/status 2>/dev/null); [ -n "$h" ] && [ "$h" -gt "$peak" ] && peak=$h
      done
      sleep 2
    done
    wait $pid; code=$?
    echo "laws exit=$code ms: $(( $(ms) - s )) peak_rss_kb=$peak"
    cut -c1-300 /tmp/out.txt | tail -80
  '
  echo "load after: $(cat /proc/loadavg) end=$(date -u +%FT%TZ)"
} >"$log" 2>&1
