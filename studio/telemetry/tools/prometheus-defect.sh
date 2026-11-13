#!/usr/bin/env bash
# Development only. Planted defect for the Prometheus gate: the alert judges ">" where the kernel says ">=".
set -u
out=$(cd "$(dirname "$0")/../out" && pwd)   # run tools/prometheus-check.sh first
cp "$out/prism.rules.yml" "$out/prism.rules.good"
sed -i 's|>= on(kpi)|> on(kpi)|g' "$out/prism.rules.yml"
t() { docker run --rm -v "$out:/out" -w /out --entrypoint promtool prom/prometheus:v3.5.0 test rules rules.test.yml; }
t; echo "planted exit=$?"
mv "$out/prism.rules.good" "$out/prism.rules.yml"
t; echo "restored exit=$?"
