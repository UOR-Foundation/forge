#!/usr/bin/env bash
# Samples, once a second, which tool `prismpm verify` is running, because SDK
# 0.3.0 does not honour PRISMPM_PROGRESS. Prints "<unix seconds> <tool> <args>"
# for the deepest descendant of the newest `prismpm verify`, "(prismpm)" when it
# has no child. Ends when no `prismpm verify` has been seen for 30 seconds.
# Usage (inside WSL): bench/sample.sh > logs/sample-<label>.log
set -u
idle=0
while (( idle < 30 )); do
  root=$(pgrep -n -f '^prismpm verify$' || true)
  if [[ -z $root ]]; then idle=$((idle + 1)); sleep 1; continue; fi
  idle=0
  leaf=$root
  while child=$(pgrep -P "$leaf" | head -1) && [[ -n $child ]]; do leaf=$child; done
  if [[ $leaf == "$root" ]]; then
    echo "$(date +%s) (prismpm)"
  else
    echo "$(date +%s) $(ps -o comm= -p "$leaf") $(ps -o args= -p "$leaf" | cut -c1-160)"
  fi
  sleep 1
done
