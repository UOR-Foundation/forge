#!/usr/bin/env bash
# Makes the exports the tab checks, from a project whose staging tree was captured from the image:
#   dist/exports/<name>.whole.ndjson       every declaration the attestation lists, with all it depends on
#   dist/exports/<name>.<theorem>.ndjson   one theorem with all it depends on (its axioms are then exactly the
#                                          axioms the export declares, which is what `#print axioms` reports)
#   evidence/<name>.authority.json         what the image's attestation says of each declaration
#   bash v2/in-tab-prove/make-exports.sh <name> <entry Lean module> <theorem> [theorem ...]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
name=$1; module=$2; shift 2
project=$HOME/itp/$name
mkdir -p "$here/dist/exports" "$here/evidence"
python3 - "$project" "$here/evidence/$name.authority.json" <<'PY'
import json, sys
a = json.load(open(sys.argv[1] + "/verified/attestation.json"))
keep = {k: a[k] for k in ("attestation_id", "status", "lexlean", "toolchain", "oleans", "declarations")}
json.dump(keep, open(sys.argv[2], "w"), indent=1, sort_keys=True)
# nanoda refuses an export holding a definition of `partial` safety (parser.rs asserts). The 16 here are the
# compiler's `_unsafe_rec` copies of recursive functions. Lean's kernel checks them; nothing safe may refer to them.
roots = [d["name"] for d in a["declarations"] if not d["name"].endswith("._unsafe_rec")]
open(sys.argv[1] + "/roots.txt", "w").write("\n".join(roots))
PY
mapfile -t roots < "$project/roots.txt"
bash "$here/export.sh" "$name" "$module" "$here/dist/exports/$name.whole.ndjson" "${roots[@]}"
for theorem in "$@"; do
  bash "$here/export.sh" "$name" "$module" "$here/dist/exports/$name.${theorem##*.}.ndjson" "$theorem"
done
