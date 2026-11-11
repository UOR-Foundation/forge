#!/usr/bin/env bash
set -euo pipefail
root=$PWD
mode=$1
case "$mode" in template) cd upstream; recipe=vv;; candidate) cd source; recipe=app;; *) exit 64;; esac
[[ -z ${ACTIONS_ID_TOKEN_REQUEST_URL:-} && -z ${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-} && -z ${PRISM_REGISTRY_TOKEN:-} && -z ${GITHUB_TOKEN:-} ]]
image=$(python3 -c 'import json;print(json.load(open("prismpm.lock"))["sdk_image"])')
[[ "$image" == 'ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b47d7a370c4a26b8285f5e9c3bb15e639973c55505c3809ddbe55352fea58' ]]
docker_config=$(mktemp -d "$RUNNER_TEMP/qualification-docker.XXXXXX")
trap 'rm -rf "$docker_config"' EXIT
printf '{}\n' >"$docker_config/config.json"
# PROPOSED official full-gate Docker setup. Requires parent review before running.
# The socket lets the immutable SDK execute its official nested buildx path.
# No host security setting, credential configuration, registry login or push.
DOCKER_CONFIG="$docker_config" docker pull "$image"
DOCKER_CONFIG="$docker_config" docker image inspect "$image" --format '{{.Id}}' >"$root/evidence/sdk-image-id.txt"
DOCKER_CONFIG="$docker_config" docker run --rm \
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
  --env SDK_IMAGE="$image" --env RECIPE="$recipe" \
  "$image" bash -euo pipefail -c '
    if [[ "$RECIPE" == vv ]]; then
      umask 077
      docker buildx version
      docker buildx inspect --bootstrap
      manifest=$(docker buildx imagetools inspect "$SDK_IMAGE")
      grep -q "linux/amd64" <<< "$manifest"
      grep -q "linux/arm64" <<< "$manifest"
      devcontainer --version
      exec just vv
    else
      exec just app
    fi
  ' 2>&1 | tee "$root/evidence/sdk-$mode.log"
