#!/usr/bin/env bash
# Builds Lean's own kernel as an export checker, natively, in WSL. Run detached; the log says when it is done.
#   bash v2/serverless-prove/official/build.sh > ~/slp/official.log 2>&1 &
set -euo pipefail
export PATH=$HOME/.elan/bin:$PATH
here=$(cd "$(dirname "$0")" && pwd)
work=$HOME/slp/official
mkdir -p "$work"
cp "$here/Main.lean" "$here/lakefile.toml" "$here/lean-toolchain" "$work/"
cd "$work"
# lean4export's own toolchain file names v4.32.2; the require is built with this project's 4.32.1.
lake update
echo "leanprover/lean4:v4.32.1" > .lake/packages/lean4export/lean-toolchain
time lake build
ls -l .lake/build/bin/kernel
