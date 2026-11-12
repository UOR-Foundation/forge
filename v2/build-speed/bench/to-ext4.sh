#!/usr/bin/env bash
# Copies a project's sources (no build outputs) to WSL's own disk: bench/to-ext4.sh <project dir name>
set -euo pipefail
b=$(cd "$(dirname "$0")/.." && pwd)
dest=$HOME/build-speed/$1
rm -rf "$dest"; mkdir -p "$dest"
tar -C "$b/$1" --exclude=./.prism --exclude=./.lexlean --exclude=./target -cf - . | tar -C "$dest" -xf -
ls -la "$dest"
