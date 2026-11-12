#!/usr/bin/env bash
# Stages the guest-list app (v2/loop/answers/guests-3.verified.lex.tex, the form of corpus/guests-3 that Lean proved)
# as a project: the payment project's library and configuration with the app as the one entry module.
#   bash v2/in-tab-prove/stage-guests.sh <name> [spec file]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bash "$here/stage-project.sh" "$here/../probe-payment" "$1" >/dev/null
dst=$HOME/itp/$1
rm "$dst/src/Payment.lex.tex" "$dst/src/PaymentApproval.lex.tex"
cp "${2:-$here/../loop/answers/guests-3.verified.lex.tex}" "$dst/src/App.lex.tex"
sed -i 's#entrypoints = \["src/Payment.lex.tex"\]#entrypoints = ["src/App.lex.tex"]#' "$dst/lexlean.toml"
rm -f "$dst/lexlean.lock"
echo "$dst"
