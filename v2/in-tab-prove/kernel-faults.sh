#!/usr/bin/env bash
# Gives Lean's own kernel, in the pinned SDK image, three declarations made outside LexLean (faults/*.lean) on top
# of the payment project the image elaborated: elaborate each, replay each with leanchecker as `lexlean verify`
# stage 8 does, and print its axioms as stage 9 does. Then exports each for the tab. Writes evidence/kernel-faults.txt.
#   bash v2/in-tab-prove/kernel-faults.sh
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
project=$HOME/itp/payment
rm -rf "$project/faults"; mkdir -p "$project/faults" "$project/staging/oleans/Fault"
cp "$here"/faults/*.lean "$project/faults/"
cat > "$project/run-faults.sh" <<'INNER'
export LEAN_PATH=$PWD/staging/oleans
for name in True Sorry Hacked; do
  echo "== $name: lean"
  lake env lean -o staging/oleans/Fault/$name.olean faults/$name.lean; echo "exit $?"
  echo "== $name: leanchecker"
  lake env leanchecker Fault.$name; echo "exit $?"
done
printf 'import Fault.True\nimport Fault.Sorry\nimport Fault.Hacked\n#print axioms Fault.trueAdvance\n#print axioms Fault.sorryAdvance\n#print axioms Fault.hackedAdvance\n' > faults/Audit.lean
echo "== audit"; lake env lean faults/Audit.lean; echo "exit $?"
INNER
( cd "$project" && chmod +x build-local.sh && ./build-local.sh "sh run-faults.sh" ) > "$here/evidence/kernel-faults.txt" 2>&1
cat "$here/evidence/kernel-faults.txt"
bash "$here/export.sh" payment Fault.True "$here/dist/exports/fault.true.ndjson" Fault.trueAdvance
bash "$here/export.sh" payment Fault.Sorry "$here/dist/exports/fault.sorry.ndjson" Fault.sorryAdvance
bash "$here/export.sh" payment Fault.Hacked "$here/dist/exports/fault.hacked.ndjson" Fault.hackedAdvance
