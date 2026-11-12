#!/usr/bin/env bash
# The authority on planted faults: four variants of real specs, each with one fault, through `lexlean verify` in the
# pinned SDK image. Writes evidence/spec-faults.json (exit code and diagnostics of each).
#   bash v2/in-tab-prove/spec-faults.sh
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
payment=$here/../probe-payment/src/Payment.lex.tex
guests=$here/../loop/answers/guests-3.verified.lex.tex
tmp=$(mktemp -d)
# 1. A false statement: clearing adds 1, the theorem says 2.
sed 's#statement: ((project (cleared state) revision) = ((project state revision) + 1)),#statement: ((project (cleared state) revision) = ((project state revision) + 2)),#' "$payment" > "$tmp/false-statement.tex"
# 2. A broken proof: the definition the arithmetic must unfold is not named.
sed 's#proof: linear_arithmetic{definitions: \[cleared\]},#proof: linear_arithmetic{definitions: [view]},#' "$payment" > "$tmp/broken-proof.tex"
# 3. A true theorem that declares fewer axioms than its proof uses.
python3 - "$payment" "$tmp/wrong-axioms.tex" <<'PY'
import sys
text = open(sys.argv[1]).read()
head, tail = text.rsplit("axioms: [propext]", 1)
open(sys.argv[2], "w").write(head + "axioms: []" + tail)
PY
# 4. A false statement closed by reflexivity: the guest list starts empty, the theorem says the revision starts at 1.
sed 's#statement: ((project (initial) guests) = (nil Foundation.View.Browser.V1.Model::TableRow)),#statement: ((project (initial) revision) = 1),#' "$guests" > "$tmp/false-reflexivity.tex"
for f in false-statement broken-proof wrong-axioms false-reflexivity; do cmp -s "$tmp/$f.tex" "$payment" && { echo "$f: nothing was planted"; exit 1; }; done
cmp -s "$tmp/false-reflexivity.tex" "$guests" && { echo "false-reflexivity: nothing was planted"; exit 1; }

echo "{" > "$here/evidence/spec-faults.json"
first=1
for fault in false-statement broken-proof wrong-axioms false-reflexivity; do
  if [ "$fault" = false-reflexivity ]; then
    bash "$here/stage-guests.sh" "fault-$fault" "$tmp/$fault.tex" >/dev/null; entry=src/App.lex.tex
  else
    bash "$here/stage-project.sh" "$here/../probe-payment" "fault-$fault" >/dev/null
    cp "$tmp/$fault.tex" "$HOME/itp/fault-$fault/src/Payment.lex.tex"; rm -f "$HOME/itp/fault-$fault/lexlean.lock"; entry=src/Payment.lex.tex
  fi
  ( cd "$HOME/itp/fault-$fault" && chmod +x build-local.sh && ./build-local.sh "lexlean lock >/dev/null 2>&1; lexlean verify $entry --diagnostic-format json > verify.json; echo exit \$?" > verify.log 2>&1 )
  [ $first = 1 ] || echo "," >> "$here/evidence/spec-faults.json"; first=0
  printf '"%s": ' "$fault" >> "$here/evidence/spec-faults.json"
  python3 -c "
import json,sys
r=json.load(open(sys.argv[1]))
print(json.dumps({'exit_code':r['exit_code'],'diagnostics':[{'code':d.get('code'),'message':d.get('message','')[:400]} for d in r['diagnostics']]}))" "$HOME/itp/fault-$fault/verify.json" >> "$here/evidence/spec-faults.json"
  tail -1 "$HOME/itp/fault-$fault/verify.log"
done
echo "}" >> "$here/evidence/spec-faults.json"
cat "$here/evidence/spec-faults.json" | cut -c1-700
