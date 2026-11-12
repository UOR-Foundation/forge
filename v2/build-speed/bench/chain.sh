#!/usr/bin/env bash
# Before and after, one at a time: the unchanged probe, then a warm rerun of the split probe, both on ext4.
b=$(cd "$(dirname "$0")/.." && pwd)
"$b/bench/to-ext4.sh" probe-app-copy >/dev/null
"$b/bench/run.sh" "$HOME/build-speed/probe-app-copy" baseline-ext4-warmvol build-speed-cache-cd3b47d7a370
"$b/bench/run.sh" "$HOME/build-speed/probe-app-split" split-ext4-warm build-speed-cache-cd3b47d7a370
