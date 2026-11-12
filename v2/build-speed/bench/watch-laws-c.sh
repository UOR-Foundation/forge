#!/usr/bin/env bash
# Records, every 30 s, how far the `lean -c` run of Laws.lean in container $1 has got:
# the bytes of panic output and of Laws.c. Ends when the container is gone.
set -u
b=$(cd "$(dirname "$0")/.." && pwd)
while out=$(docker exec "$1" sh -c 'echo "out_bytes=$(stat -c %s /tmp/out.txt) c_bytes=$(stat -c %s /tmp/Laws.c) lean_etime=$(ps -o etime= -C lean)"' 2>/dev/null); do
  echo "$(date -u +%FT%TZ) $out"
  sleep 30
done >>"$b/logs/laws-j2-c-loaded.watch.log"
echo "$(date -u +%FT%TZ) container gone" >>"$b/logs/laws-j2-c-loaded.watch.log"
