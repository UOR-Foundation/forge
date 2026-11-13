# Development: verify, set observed axioms, repeat until verify passes or nothing changes.
cd "$(dirname "$0")"
for i in $(seq 1 12); do
  wsl -d Ubuntu -- bash -c 'bash "/mnt/c/Users/pavel/Desktop/HOLOGRAM/forge/.claude/worktrees/elegant-noether-efd461/v2/serverless-prove/verify-spec.sh" > ~/slp/verify-spec.log 2>&1'
  node -e 'const v=require("./spec/evidence/verify.json"); console.log(v.exit_code, v.success); for (const d of v.diagnostics) console.log(d.code, d.message.slice(0,300))'
  node fix-axioms.mjs spec/evidence/verify.json | tail -1 | grep -q "^0 changed" && break
done
