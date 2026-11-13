#!/usr/bin/env bash
# Builds dist/lexlean-tab.wasm and dist/lexlean-tab-lean.wasm from their source: PrismPM at the commit the SDK image
# names, its vendored LexLean with the patches in upstream/ applied, and the wrapper in crate/. Run on Linux or in WSL
# with Rust 1.97.1 and the wasm32-wasip1 target. An experiment: Foundry ships no fork, so this stands only until
# upstream takes the patches. The bytes depend on the work directory's path (it is in panic messages), so the recorded
# addresses are reproduced only with the default one.
#   bash v2/in-tab-check/build.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$HOME/itc
commit=35e9f01d5415ed4b0b64c152238f291546957ec4
# The stack LexLean's own plan gives the compile thread for max_scope_depth = 1024 (config.rs: 16 MiB + 1024 * 64 KiB).
export RUSTFLAGS="-C link-arg=-zstack-size=83886080"
# The language-1.2 compiler-semantics ID the lean build carries: the one in the lock the SDK image wrote.
semantics=$(sed -n 's/^compiler_semantics = "\([0-9a-f]\{64\}\)"$/\1/p' "$here/../probe-payment/lexlean.lock")

mkdir -p "$work" "$here/dist"
if [ ! -d "$work/PrismPM/.git" ]; then git clone -q https://github.com/UOR-Foundation/PrismPM.git "$work/PrismPM"; fi
git -C "$work/PrismPM" checkout -q -f "$commit"
mkdir -p "$work/tab"
cp -r "$here/crate/." "$work/tab/"
sed -i "s#^lexlean = .*#lexlean = { path = \"$work/PrismPM/vendor/lexlean\" }#" "$work/tab/Cargo.toml"

git -C "$work/PrismPM" apply "$here/upstream/wasm-check.patch"
( cd "$work/tab" && cargo +1.97.1 build --release --locked --target wasm32-wasip1 )
cp "$work/tab/target/wasm32-wasip1/release/lexlean_tab.wasm" "$here/dist/lexlean-tab.wasm"

git -C "$work/PrismPM" apply "$here/upstream/lean-embed.patch"
( cd "$work/tab" && LEXLEAN_CHECK_ONLY_SEMANTICS_1_2=$semantics cargo +1.97.1 build --release --locked --target wasm32-wasip1 )
cp "$work/tab/target/wasm32-wasip1/release/lexlean_tab.wasm" "$here/dist/lexlean-tab-lean.wasm"

sha256sum "$here/dist/lexlean-tab.wasm" "$here/dist/lexlean-tab-lean.wasm"
echo "now run: node v2/in-tab-check/make-manifest.mjs --check   (or --write after a deliberate change)"
