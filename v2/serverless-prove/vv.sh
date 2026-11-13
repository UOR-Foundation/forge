#!/usr/bin/env bash
# Runs the repository's acceptance gate, `just vv`, in the SDK image prismpm.lock pins, on a copy of this commit on
# the Linux disk (builds under /mnt/c are slow). Output in ~/slp/vv.log.   bash v2/serverless-prove/vv.sh <archive.tar>
set -uo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
work=$HOME/slp/vv
rm -rf "$work"; mkdir -p "$work"
# A worktree's .git points at a Windows path WSL cannot read, so the archive is made on the Windows side:
#   git archive -o <tar> HEAD, then: bash vv.sh <tar>
tar -xf "$1" -C "$work"
cp "$here/v2/probe-payment/build-local.sh" "$work/build-local.sh"
cd "$work" && git init -q && git add -A && git -c user.email=vv@local -c user.name=vv commit -qm vv
bash build-local.sh "just vv"; echo "vv exit $?"
