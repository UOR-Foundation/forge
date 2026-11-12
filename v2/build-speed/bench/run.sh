#!/usr/bin/env bash
# Runs one sampled verify: bench/run.sh <project dir name> <label> <volume | tmpfs> [docker run flags...]
set -u
b=$(cd "$(dirname "$0")/.." && pwd)
project=$1; label=$2; shift 2
"$b/bench/sample.sh" >"$b/logs/sample-$label.log" &
case $project in /*) dir=$project ;; *) dir=$b/$project ;; esac
"$b/bench/verify.sh" "$dir" "$label" "$@"
wait
