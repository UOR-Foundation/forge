#!/usr/bin/env bash
# Development only: builds this project in the SDK image prismpm.lock pins, as .github/workflows/build.yml does.
set -euo pipefail
cd "$(dirname "$0")"
image=$(sed -n 's/.*"sdk_image":"\([^"]*\)".*/\1/p' prismpm.lock)
docker_config=$(mktemp -d); trap 'rm -rf "$docker_config"' EXIT
printf '{}\n' >"$docker_config/config.json"
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  --tmpfs /tmp:rw,exec,nosuid,size=2g \
  --volume "$PWD:$PWD" \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$docker_config:/tmp/prismpm-home/.docker:ro" \
  --workdir "$PWD" \
  --env DOCKER_CONFIG=/tmp/prismpm-home/.docker \
  --env BUILDX_CONFIG=/tmp/prismpm-buildx \
  --env HOME=/tmp/prismpm-home \
  --env PRISMPM_EPHEMERAL_HOME=1 \
  "$image" sh -c "${1:-lexlean lock && lexlean fmt --check --all && prismpm verify}"
