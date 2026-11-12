#!/usr/bin/env bash
# Copies a LexLean project to the Linux disk (builds under /mnt/c are slow and have failed) with the repository's
# prismpm.lock beside it, so build-local.sh can run a command on it in the pinned SDK image.
#   bash v2/in-tab-prove/stage-project.sh <project dir in the repository> <name>
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
src=$(cd "$1" && pwd)
dst=$HOME/itp/$2
rm -rf "$dst"; mkdir -p "$dst"
cp -r "$src/." "$dst/"
rm -rf "$dst/.lexlean" "$dst/.lake" "$dst/data"
cp "$here/../../prismpm.lock" "$dst/prismpm.lock"
cp "$here/../probe-payment/build-local.sh" "$dst/build-local.sh"
echo "$dst"
