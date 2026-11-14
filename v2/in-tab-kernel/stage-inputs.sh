#!/usr/bin/env bash
# Copies the inputs the serverless-prove experiment judged (its dist/, not committed) into the work folder.
#   bash stage-inputs.sh <serverless-prove/dist>
set -euo pipefail
dist=$1
work=${TLK:-$HOME/tlk}
mkdir -p "$work/inputs"
cp -n "$dist"/assembled/*.ndjson "$work/inputs/"
cp -n "$dist/library.ndjson" "$dist/guests.suffix.ndjson" "$dist/payment.suffix.ndjson" "$work/"
ls "$work/inputs" | wc -l
sha256sum "$work/library.ndjson"
