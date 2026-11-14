#!/usr/bin/env bash
# libuv for the WebAssembly runtime, as Lean's own build makes it (src/CMakeLists.txt at the pinned commit, "LibUV"):
# tag v1.48.0 with the one patch Lean applies, built static. The only difference is that no -pthread is passed.
#   bash build-libuv.sh
set -euo pipefail
work=${TLK:-$HOME/tlk}
# shellcheck disable=SC1091
source "$work/emsdk/emsdk_env.sh" > /dev/null 2>&1
cd "$work"
[ -d libuv ] || git clone -q --depth 1 --branch v1.48.0 https://github.com/libuv/libuv
cd libuv
git reset -q --hard HEAD
git rev-parse HEAD
# Lean's patch, verbatim in effect: the Emscripten build takes the stub process-title source.
python3 - <<'EOF'
import pathlib
p = pathlib.Path("CMakeLists.txt")
t = p.read_text()
anchor = 'if(CMAKE_SYSTEM_NAME STREQUAL "Linux")\n  list(APPEND uv_defines _GNU_SOURCE _POSIX_C_SOURCE=200112)'
assert t.count(anchor) == 1
p.write_text(t.replace(anchor, 'if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")\n  list(APPEND uv_sources\n       src/unix/no-proctitle.c)\nendif()\n\n' + anchor))
EOF
emcmake cmake -B build -DCMAKE_BUILD_TYPE=Release -DLIBUV_BUILD_TESTS=OFF -DLIBUV_BUILD_SHARED=OFF -DCMAKE_POSITION_INDEPENDENT_CODE=OFF "-DCMAKE_C_FLAGS=-fwasm-exceptions" > build.log 2>&1
emmake make -C build -j8 uv_a >> build.log 2>&1 || { tail -30 build.log; exit 1; }
ls -l build/libuv.a
