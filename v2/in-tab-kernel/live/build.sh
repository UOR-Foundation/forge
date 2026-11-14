#!/usr/bin/env bash
# The proved checker of studio/proof/PrismLive as a library the in-tab kernel can hold, and Verdant's proof as a
# suffix of it.
#   bash live/build.sh        (WSL; needs lean4export built by ../native.sh's toolchain, and the 4.32.1 toolchain)
#
#   $TLK/live/library.ndjson   regionCheck_sound with all it rests on, and the few constants an app's proof names
#   $TLK/live/verdant.ndjson   what VerdantR.all_hold adds: its rules, its guarantees, and the two theorems
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${TLK:-$HOME/tlk}/live
export PATH=$HOME/.elan/toolchains/leanprover--lean4---v4.32.1/bin:$PATH
exporter=${EXPORTER:-$HOME/itp/ext/lean4export/.lake/build/bin/lean4export}
rm -rf "$work"; mkdir -p "$work"
cp -r "$here/../../../studio/proof/." "$work/proof"
cd "$work/proof"
time lake build 2>&1 | tail -3
export LEAN_PATH="$work/proof/.lake/build/lib/lean:$(lean --print-prefix)/lib/lean"
# The library's roots: the soundness theorem, then every constant Verdant's proof names that is not Verdant's own,
# so an app's suffix holds the app and nothing else.
"$exporter" PrismLive.VerdantRegions -- PrismLive.Kernel.regionCheck_sound > "$work/core.ndjson"
"$exporter" PrismLive.VerdantRegions -- PrismLive.Kernel.regionCheck_sound VerdantR.all_hold > "$work/first.ndjson"
python3 - "$work" <<'PY'
import json, sys
work = sys.argv[1]
core = open(work + "/core.ndjson").read().splitlines()
first = open(work + "/first.ndjson").read().splitlines()
assert first[:len(core)] == core, "the core export is not a prefix"
names = {}
extra = []
for line in first:
    o = json.loads(line)
    if "str" in o and "in" in o: names[o["in"]] = (names.get(o["str"]["pre"], "") + "." + o["str"]["str"]).lstrip(".")
    if "num" in o and "in" in o: names[o["in"]] = (names.get(o["num"]["pre"], "") + "." + str(o["num"]["i"])).lstrip(".")
def declared(o):
    for kind in ("axiom", "def", "thm", "opaque", "quot", "inductive"):
        if kind in o:
            d = o[kind]
            if kind == "inductive": return [names[t["name"]] for t in d.get("types", [])]
            return [names[d["name"]]]
    return []
for line in first[len(core):]:
    for n in declared(json.loads(line)):
        if not n.startswith("VerdantR"): extra.append(n)
open(work + "/extra-roots.txt", "w").write("\n".join(extra))
print("constants Verdant's proof names beyond the theorem's own closure:", extra)
PY
mapfile -t extra < "$work/extra-roots.txt"
"$exporter" PrismLive.VerdantRegions -- PrismLive.Kernel.regionCheck_sound "${extra[@]}" > "$work/library.ndjson"
"$exporter" PrismLive.VerdantRegions -- PrismLive.Kernel.regionCheck_sound "${extra[@]}" VerdantR.all_hold > "$work/whole.ndjson"
size=$(stat -c %s "$work/library.ndjson")
cmp -s -n "$size" "$work/library.ndjson" "$work/whole.ndjson" || { echo "the library is not a prefix of Verdant's export"; exit 1; }
tail -c +"$((size + 1))" "$work/whole.ndjson" > "$work/verdant.ndjson"
ls -l "$work"/library.ndjson "$work"/verdant.ndjson
gzip -9 -c "$work/library.ndjson" | wc -c
sha256sum "$work/library.ndjson" "$work/verdant.ndjson"
