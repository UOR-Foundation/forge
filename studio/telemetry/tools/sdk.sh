#!/usr/bin/env bash
# Development only: runs a LexLean command on this project in the SDK image the repository's
# prismpm.lock pins. The project is copied to the Linux disk first (builds under /mnt/c stall).
# Usage, inside WSL: studio/telemetry/tools/sdk.sh '<command>'   (default: lexlean lock && lexlean check --all)
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
image=$(sed -n 's/.*"sdk_image":"\([^"]*\)".*/\1/p' "$here/../../prismpm.lock")
work=$HOME/prism-telemetry-studio
mkdir -p "$work"
cp -r "$here/src" "$here/lexlean.toml" "$here/lean-toolchain" "$here/lakefile.toml" "$here/lake-manifest.json" "$work/"
[ -f "$here/lexlean.lock" ] && cp "$here/lexlean.lock" "$work/"
docker run --rm --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,exec,nosuid,size=2g \
  --volume "$work:$work" --workdir "$work" --env HOME=/tmp/prismpm-home --env PRISMPM_EPHEMERAL_HOME=1 \
  "$image" sh -c "${1:-lexlean lock && lexlean check --all}"
cp "$work/lexlean.lock" "$here/lexlean.lock" 2>/dev/null || true
cp "$work/src/"*.lex.tex "$here/src/"
