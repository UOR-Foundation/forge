#!/usr/bin/env bash
# The untrusted prover: makes the proof terms of a verified project as a suffix of the pinned library's export.
# Nothing it writes is believed. The tab re-derives every address and Lean's kernel judges every declaration; a wrong
# or stale pack, a different Lean or a tampered suffix ends in a refusal there, never in an acceptance.
#
#   bash prove.sh <verified dir> <pack dir> <lean4export binary> <out dir>
#
#   <verified dir>  .lexlean/verified/<id> of a `lexlean verify` or `prismpm verify` run: modules/ holds the Lean
#                   rendering of each project module, attestation.json lists its declarations.
#   <pack dir>      the runtime library's compiled files for this LexLean (oleans/, with their .server and .private
#                   parts, which `lexlean verify` does not publish), library-roots.txt, and library.ndjson.
#   <out dir>       suffix.ndjson and proof.json are written here.
#
# Lean must be 4.32.1 on PATH (`lean --githash` is checked): the pack's files load only in the Lean that wrote them.
set -euo pipefail
verified=$(cd "$1" && pwd); pack=$(cd "$2" && pwd); export_bin=$3; out=$4
pin=f054605aea4b840552cca2e725580bffd1e1b704
[ "$(lean --githash)" = "$pin" ] || { echo "lean is not $pin"; exit 1; }
mkdir -p "$out"; out=$(cd "$out" && pwd)
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
sysroot=$(lean --print-prefix)
export LEAN_PATH="$work/oleans:$pack/oleans:$sysroot/lib/lean"

# The project's modules, each after the modules it imports.
python3 - "$verified/modules" "$work/order.txt" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
mods = {".".join(p.relative_to(root).with_suffix("").parts): p for p in root.rglob("*.lean")}
deps = {m: [d for d in re.findall(r"^(?:public\s+)?(?:meta\s+)?import\s+(?:all\s+)?([\w.]+)", p.read_text(encoding="utf-8"), re.M) if d in mods] for m, p in mods.items()}
order, seen = [], set()
def visit(m, path=()):
    if m in seen: return
    if m in path: raise SystemExit("import cycle at " + m)
    for d in sorted(deps[m]): visit(d, path + (m,))
    seen.add(m); order.append(m)
for m in sorted(mods): visit(m)
pathlib.Path(sys.argv[2]).write_text("".join(f"{m}\t{mods[m]}\n" for m in order))
PY
while IFS=$'\t' read -r module file; do
  target="$work/oleans/$(echo "$module" | tr . /).olean"
  mkdir -p "$(dirname "$target")"
  lean -R "$verified/modules" -o "$target" "$file"
done < "$work/order.txt"

# Roots: the library's, in the pinned order, then the project's as the attestation lists them. The exporter writes
# what the first roots reach before the rest, so the pinned library export is a prefix of this one.
python3 - "$verified/attestation.json" "$pack/library-roots.txt" "$work/roots.txt" <<'PY'
import json, sys
library = open(sys.argv[2]).read().split("\n")
names = [d["name"] for d in json.load(open(sys.argv[1]))["declarations"]]
project = [n for n in names if not n.startswith("LexLean") and not n.endswith("._unsafe_rec")]
open(sys.argv[3], "w").write("\n".join(library + project))
PY
mapfile -t roots < "$work/roots.txt"
entry=$(tail -1 "$work/order.txt" | cut -f1)
"$export_bin" "$entry" -- "${roots[@]}" > "$work/whole.ndjson"
size=$(stat -c %s "$pack/library.ndjson")
cmp -s -n "$size" "$pack/library.ndjson" "$work/whole.ndjson" || { echo "the pinned library export is not a prefix of this project's export"; exit 1; }
tail -c +"$((size + 1))" "$work/whole.ndjson" > "$out/suffix.ndjson"
python3 - "$out" "$pack/library.ndjson" "$verified/attestation.json" "$pin" <<'PY'
import hashlib, json, sys
out, library, attestation, pin = sys.argv[1:5]
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
a = json.load(open(attestation))
json.dump({"schema": "prism/in-tab-proof/1", "lean": pin, "library": sha(library), "suffix": sha(out + "/suffix.ndjson"),
           "declared": a.get("attestation_id"), "note": "untrusted: check in the tab"}, open(out + "/proof.json", "w"), indent=1, sort_keys=True)
print(open(out + "/proof.json").read())
PY
ls -l "$out"
