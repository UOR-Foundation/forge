#!/usr/bin/env bash
# Exports the kernel terms of a verified project's theorems, with everything they depend on, in lean4export's NDJSON
# form. Input: the staging tree capture-staging.sh copied from a `lexlean verify` run in the SDK image. Lean here is the
# elan toolchain 4.32.1, the same commit the image runs; the export is a reading of the .olean, not a new elaboration.
#   bash v2/in-tab-prove/export.sh <name> <module> <out.ndjson> [constant ...]
set -euo pipefail
project=$HOME/itp/$1; module=$2; out=$3; shift 3
cd "$project"
sysroot=$(lean --print-prefix)
export LEAN_PATH="$project/staging/oleans:$sysroot/lib/lean"
if [ $# -gt 0 ]; then
  "$HOME/itp/ext/lean4export/.lake/build/bin/lean4export" "$module" -- "$@" > "$out"
else
  "$HOME/itp/ext/lean4export/.lake/build/bin/lean4export" "$module" > "$out"
fi
ls -l "$out"
