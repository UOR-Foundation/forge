#!/usr/bin/env bash
# Builds dist/kernel-tab.wasm: nanoda_lib at a pinned commit, unmodified, behind the wrapper in crate/. Also builds
# nanoda's own native binary (the reference the wasm build is compared with) and lean4export for Lean 4.32.1.
# Run on Linux or in WSL with Rust 1.97.1 (wasm32-wasip1) and elan. An experiment, not a shipped build.
#   bash v2/in-tab-prove/build.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$HOME/itp
nanoda=0da9f98feadd3a0a2ef4b3dbcf52a298a6fef929
# lean4export has no v4.32.1 tag; v4.32.2 is the nearest and builds unchanged with the 4.32.1 toolchain.
exporter=86e4a339507466921dc8c5417c8cb1de1ce7df60
# The linear-memory stack. nanoda's own default for its checking thread is 32 MiB.
export RUSTFLAGS="-C link-arg=-zstack-size=33554432"

mkdir -p "$work/ext" "$here/dist"
[ -d "$work/ext/nanoda_lib/.git" ] || git clone -q https://github.com/ammkrn/nanoda_lib "$work/ext/nanoda_lib"
[ -d "$work/ext/lean4export/.git" ] || git clone -q https://github.com/leanprover/lean4export "$work/ext/lean4export"
git -C "$work/ext/nanoda_lib" checkout -q -f "$nanoda"
git -C "$work/ext/lean4export" checkout -q -f "$exporter"
echo "leanprover/lean4:v4.32.1" > "$work/ext/lean4export/lean-toolchain"
( cd "$work/ext/lean4export" && lake build )

rm -rf "$work/kernel/crate" "$work/kernel/nanoda_lib"; mkdir -p "$work/kernel"
cp -r "$here/crate" "$work/kernel/crate"
git -C "$work/ext/nanoda_lib" archive --prefix=nanoda_lib/ "$nanoda" | tar -x -C "$work/kernel"
( cd "$work/kernel/crate" && CARGO_TARGET_DIR="$work/kernel/target" cargo +1.97.1 build --release --target wasm32-wasip1 )
cp "$work/kernel/target/wasm32-wasip1/release/kernel_tab.wasm" "$here/dist/kernel-tab.wasm"
( cd "$work/kernel/nanoda_lib" && RUSTFLAGS= CARGO_TARGET_DIR="$work/kernel/target-native" cargo +1.97.1 build --release --locked )
sha256sum "$here/dist/kernel-tab.wasm"; ls -l "$here/dist/kernel-tab.wasm"
