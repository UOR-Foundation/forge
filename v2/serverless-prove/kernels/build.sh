#!/usr/bin/env bash
# Builds browser candidates among the Lean Kernel Arena's checkers as WebAssembly, at the commits the arena pins.
# Run in WSL, detached; each candidate logs to ~/slp/kernels/<name>.log.   bash kernels/build.sh [name ...]
set -uo pipefail
export PATH=$HOME/.cargo/bin:$HOME/.elan/bin:$PATH
work=$HOME/slp/kernels
mkdir -p "$work"
fetch() { # name url rev
  [ -d "$work/$1/.git" ] || git clone -q "$2" "$work/$1"
  git -C "$work/$1" fetch -q origin "$3" 2>/dev/null; git -C "$work/$1" checkout -q -f "$3"
}
build_kefir() {
  fetch kefir https://github.com/dmitrykorolev/kefir e00bbd5bf5f3bc2a1c6d6aa0c9e6b29584763d79
  cd "$work/kefir" && cat scripts/wasm/build.sh && sh scripts/wasm/build.sh && ls -l target/wasm32-wasip1/release/*.wasm
}
build_pestka() {
  fetch pestka https://github.com/jasisz/pestka 7caa557d52127407589d9f02d3330265219755ee
  cd "$work/pestka" && cargo install aver-lang --version "$(cat .aver-version)" --locked --features wasm --root "$PWD/.aver" \
    && AVER="$PWD/.aver/bin/aver" bin/build-wasm && find . -name "*.wasm" -newer .aver-version -exec ls -l {} \;
}
build_palladium() {
  fetch palladium https://github.com/yoonwoojeong/Palladium "$(git ls-remote https://github.com/yoonwoojeong/Palladium HEAD | cut -f1)"
  cd "$work/palladium" && cargo build --release --target wasm32-wasip1 && ls -l target/wasm32-wasip1/release/*.wasm
}
for name in "${@:-kefir pestka palladium}"; do
  for n in $name; do ( echo "== $n $(date -Is)"; "build_$n"; echo "exit $?" ) > "$work/$n.log" 2>&1; done
done
