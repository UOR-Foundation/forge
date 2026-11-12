#!/usr/bin/env bash
# Builds dist/lexlean-tab.wasm from its source: PrismPM at the commit the SDK image names, its vendored LexLean with
# upstream/wasm-check.patch applied, and the wrapper in crate/. Run on Linux or in WSL with Rust 1.97.1 and the
# wasm32-wasip1 target. An experiment: Foundry ships no fork, so this stands until upstream takes the patch.
#   bash v2/in-tab-check/build.sh [work directory, default ~/itc]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${1:-$HOME/itc}
commit=35e9f01d5415ed4b0b64c152238f291546957ec4
# The stack LexLean's own plan gives the compile thread for max_scope_depth = 1024 (config.rs: 16 MiB + 1024 * 64 KiB).
stack=83886080

mkdir -p "$work"
if [ ! -d "$work/PrismPM/.git" ]; then git clone -q https://github.com/UOR-Foundation/PrismPM.git "$work/PrismPM"; fi
git -C "$work/PrismPM" checkout -q -f "$commit"
git -C "$work/PrismPM" apply "$here/upstream/wasm-check.patch"

mkdir -p "$work/tab"
cp -r "$here/crate/." "$work/tab/"
sed -i "s#^lexlean = .*#lexlean = { path = \"$work/PrismPM/vendor/lexlean\" }#" "$work/tab/Cargo.toml"
( cd "$work/tab" && RUSTFLAGS="-C link-arg=-zstack-size=$stack --remap-path-prefix=$work=/itc --remap-path-prefix=$HOME/.cargo=/cargo" \
    cargo +1.97.1 build --release --locked --target wasm32-wasip1 )
mkdir -p "$here/dist"
cp "$work/tab/target/wasm32-wasip1/release/lexlean_tab.wasm" "$here/dist/lexlean-tab.wasm"
sha256sum "$here/dist/lexlean-tab.wasm"
echo "now run: node v2/in-tab-check/make-manifest.mjs --check   (or --write after a deliberate change)"
