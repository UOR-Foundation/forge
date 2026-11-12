#!/usr/bin/env bash
# Development only: holds the exported files to Prometheus's own tool. Run inside WSL after
# `node v2/telemetry/browser-test.mjs` has written out/prism.prom and out/prism-history.om.txt.
#   promtool check metrics          the text format 0.0.4 snapshot, as a scrape would read it
#   promtool check rules / test     the alert rules, and that they fire exactly at the kernel's threshold
#   tsdb create-blocks-from         the OpenMetrics history, backfilled into TSDB blocks
#   tsdb dump                       the blocks read back: every turn's preview value is there
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
image=prom/prometheus:v3.5.0
cp "$here/tools/rules.test.yml" "$here/out/rules.test.yml"
run() { docker run --rm -i --user "$(id -u):$(id -g)" -v "$here/out:/out" -w /out --entrypoint promtool "$image" "$@"; }
echo "== check metrics"; run check metrics < "$here/out/prism.prom" && echo "  SUCCESS: no problems"
echo "== check rules"; run check rules prism.rules.yml
echo "== test rules"; run test rules rules.test.yml
echo "== backfill"; rm -rf "$here/out/tsdb"; run tsdb create-blocks-from openmetrics prism-history.om.txt tsdb
echo "== read back"; mkdir -p "$here/out/tsdb/wal"; run tsdb dump --match='prism_kpi_seconds{kpi="preview"}' tsdb | tee "$here/out/dump.txt" | head -20
test "$(grep -c 'prism_kpi_seconds' "$here/out/dump.txt")" -ge 12
echo "prometheus-check: all passed"
