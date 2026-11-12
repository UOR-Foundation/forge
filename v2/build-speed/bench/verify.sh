#!/usr/bin/env bash
# One full `prismpm verify` of a project in the SDK image its prismpm.lock pins,
# run the way `prism-code verify` runs it, with every output line stamped by
# seconds since start so each stage can be timed.
# Usage (inside WSL): bench/verify.sh <project dir> <label> <volume name | tmpfs> [docker run flags...]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
project=$(cd "$1" && pwd); label=$2; cache=$3; shift 3
image=$(sed -n 's/.*"sdk_image":"\([^"]*\)".*/\1/p' "$project/prismpm.lock")
log="$here/../logs/verify-$label.log"
if [[ $cache == tmpfs ]]; then tmp=(--tmpfs /tmp:rw,exec,nosuid,size=2g); else tmp=(--mount "type=volume,source=$cache,target=/tmp"); fi
start=$(date +%s%N)
stamp() { while IFS= read -r line; do printf '%7.1f %s\n' "$(( ($(date +%s%N) - start) / 1000000 ))e-3" "$line"; done; }
{
  echo "label=$label project=$project cache=$cache extra=[$*] image=$image"
  echo "start=$(date -u +%FT%TZ) load=$(cat /proc/loadavg)"
  ps -eo pcpu,etime,comm --sort=-pcpu | sed -n '2,6p'
  set +e
  docker run --rm --user "$(id -u):$(id -g)" --group-add "$(stat -c '%g' /var/run/docker.sock)" \
    "${tmp[@]}" --volume "$project:$project" --volume /var/run/docker.sock:/var/run/docker.sock \
    --workdir "$project" --env HOME=/tmp/prismpm-home --env PRISMPM_EPHEMERAL_HOME=1 \
    --env PRISMPM_PROGRESS=1 --env SDK_IMAGE="$image" "$@" "$image" \
    sh -c 'lexlean lock && lexlean fmt --all && lexlean lock && prismpm verify' 2>&1 | stamp
  code=${PIPESTATUS[0]}
  echo "exit=$code wall_s=$(( ($(date +%s%N) - start) / 1000000000 )) end=$(date -u +%FT%TZ) load=$(cat /proc/loadavg)"
} >"$log" 2>&1
