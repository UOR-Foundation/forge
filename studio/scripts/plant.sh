#!/bin/bash
# Plant one defect, run the gate that should catch it, restore. A gate is trusted only after it has
# been seen to fail. Usage (from the project root, Linux x86_64 with the lane's prerequisites):
#   ./scripts/plant.sh words     # change a View word in the model but not the theorem: verify must refuse
#   ./scripts/plant.sh bytes     # change the corpus's expected preimage: the corpus test must refuse
#   ./scripts/plant.sh shell     # edit a word in shell/index.html by hand: the lane's compare must refuse
#   ./scripts/plant.sh grant     # make admits accept the empty list: the theorem must refuse
#   ./scripts/plant.sh publish   # flip one byte of the committed .holo vector: PrismPM's validator must refuse
#   ./scripts/plant.sh evidence  # say closure drift is accepted in the corpus: the generated decision must disagree
#   ./scripts/plant.sh composer  # change one byte of the vendored PrismPM composer: the lane's vendor gate must refuse
#   ./scripts/plant.sh brand     # change one hex in the generated brand.css: the Brand gate must refuse
#   ./scripts/plant.sh token     # change one token in the vendored kit: the Brand gate must refuse
#   ./scripts/plant.sh hand      # type a colour into appearance.css by hand: the Brand gate must refuse
#   ./scripts/plant.sh parse     # put a raw newline in a string in host.js: the Parse gate must refuse
#   ./scripts/plant.sh hole      # drop a handler a screen reads on mount: the Contract gate must refuse
#   ./scripts/plant.sh live      # make a node's kappa ignore its content: the Live gate must refuse
#   ./scripts/plant.sh shadcn    # change one class in a vendored shadcn component: the components gate must refuse
#   ./scripts/plant.sh kitfile   # add a component of our own to the vendored registry: the components gate must refuse
#   ./scripts/plant.sh rolled    # a screen imports Base UI itself: the renderer's build must refuse the bundle
#   ./scripts/plant.sh rewrite   # a screen calls a ui component in a way the Radix rewrite cannot convert: the typecheck must refuse
#   ./scripts/plant.sh passage   # Dyad changes a passage the shell patches: the shell's screens must refuse rather than skip it
#   ./scripts/plant.sh table     # invert a condition mask in the decision table: the Table gate must refuse
#   ./scripts/plant.sh edit      # keep a patch that does not check: the Edit gate must refuse
#   ./scripts/plant.sh look      # let the build screen fall back to the home look: the Build look check must refuse
# `hole` runs the Contract gate, which bundles the vendored contracts with the renderer's own esbuild,
# so run it where those dependencies were installed for this platform -- otherwise esbuild refuses to
# start and the gate looks like it fired when it never ran.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LX="${FORGE_LANE_WORK:-$HOME/.cache/hologram-forge-lane}/PrismPM/target/release/lexlean"
export PATH="$HOME/.cargo/bin:$HOME/.elan/bin:$PATH"

restore() { git reset -q -- shell/index.html 2>/dev/null; git checkout -q -- tools/author.py tools/model_workspace.py model/corpus.json model/publish.json model/objects/publish/hello.holo core/src/holo/archive.rs shell/index.html src/Forge.lex.tex src/Workspace.lex.tex lexlean.lock shell/brand.css shell/appearance.css shell/appearance.js shell/host.js vendor/hologram-brand-kit/tokens/hologram-tokens.json 2>/dev/null; python3 tools/author.py >/dev/null; "$LX" lock >/dev/null 2>&1 || true; }
expect_fail() { if "$@" >/tmp/plant.log 2>&1; then echo "GATE DID NOT FIRE: $*"; tail -5 /tmp/plant.log; restore; exit 1; else echo "gate fired as it must: $*"; grep -m1 -E "error|violat|differ|drift|FAILED|panicked" /tmp/plant.log || tail -2 /tmp/plant.log; fi; }

case "${1:-}" in
  words)
    sed -i 's/headline=s("Own Your Ideas")/headline=s("Own your ideas")/' tools/author.py
    python3 tools/author.py >/dev/null; "$LX" lock >/dev/null 2>&1
    expect_fail "$LX" verify ;;
  grant)
    python3 - <<'EOF'
import io
p="tools/author.py"; s=io.open(p,encoding="utf-8").read()
a='''            branch("List.nil", [], b(False)),
            branch("List.cons", ["grant", "rest"],'''
b='''            branch("List.nil", [], b(True)),
            branch("List.cons", ["grant", "rest"],'''
assert s.count(a)==1; io.open(p,"w",encoding="utf-8",newline="\n").write(s.replace(a,b))
EOF
    python3 tools/author.py >/dev/null; "$LX" lock >/dev/null 2>&1
    expect_fail "$LX" verify ;;
  bytes)
    python3 - <<'EOF'
import io,json
p="model/corpus.json"; c=json.load(io.open(p,encoding="utf-8"))
c[1]["preimage"]=c[1]["preimage"].replace('"name":"hello"','"name":"hullo"')
io.open(p,"w",encoding="utf-8",newline="\n").write(json.dumps(c,indent=1,ensure_ascii=False)+"\n")
EOF
    expect_fail bash -c "cd core && cargo test --release -q --test corpus" ;;
  shell)
    # The words gate compares the projected page against the index, so the hand edit is staged as a
    # commit would stage it; an unstaged edit is simply overwritten by the projector.
    sed -i 's/<h1>Own Your Ideas<\/h1>/<h1>Own your ideas<\/h1>/' shell/index.html
    git add shell/index.html
    expect_fail bash -c "FORGE_LANE_WORK=${FORGE_LANE_WORK:-$HOME/.cache/hologram-forge-lane} ./scripts/lane.sh"
    git reset -q -- shell/index.html ;;
  publish)
    python3 - <<'EOF'
import io
p="model/objects/publish/hello.holo"; b=bytearray(io.open(p,"rb").read()); b[len(b)//3]^=1; io.open(p,"wb").write(bytes(b))
EOF
    expect_fail bash -c "cd core && cargo test --release -q --test publish" ;;
  evidence)
    python3 - <<'EOF'
import io,json
p="model/publish.json"; c=json.load(io.open(p,encoding="utf-8"))
[x for x in c if x["name"]=="closure drift"][0]["decision"]="Accept"
io.open(p,"w",encoding="utf-8",newline="\n").write(json.dumps(c,indent=1,ensure_ascii=False)+"\n")
EOF
    expect_fail bash -c "cd core && cargo test --release -q --test publish" ;;
  composer)
    sed -i 's/Exact Hologram v4 application composition and strict/Exact Hologram v4 application composition, and strict/' core/src/holo/archive.rs
    expect_fail bash -c "FORGE_LANE_WORK=${FORGE_LANE_WORK:-$HOME/.cache/hologram-forge-lane} ./scripts/lane.sh" ;;
  brand)
    sed -i '0,/--background: #f3f3ee;/s//--background: #f3f3ef;/' shell/brand.css
    expect_fail python3 tools/brand_kit.py --check ;;
  token)
    sed -i '0,/"#151312"/s//"#151313"/' vendor/hologram-brand-kit/tokens/hologram-tokens.json
    expect_fail python3 tools/brand_kit.py --check ;;
  hand)
    printf '.appearance { background: #101010; }\n' >> shell/appearance.css
    expect_fail python3 tools/brand_kit.py --check ;;
  parse)
    # A string cut by a raw newline: valid nowhere, and it once shipped, because nothing read these
    # files as code. The page it breaks draws nothing at all, so this is the cheapest defect to arm.
    # The defect is a newline, so it is planted by a tool that can hold one, not by a shell quote.
    python3 -c 'import io;p="shell/host.js";t=io.open(p,encoding="utf-8",newline="").read();a=".split(/"+chr(92)+"r?"+chr(92)+"n/)";assert t.count(a)==1,"anchor";io.open(p,"w",encoding="utf-8",newline="").write(t.replace(a,chr(46)+"split("+chr(34)+chr(10)+chr(34)+")"))'
    expect_fail node tools/shell_parse.mjs ;;
  hole)
    # A required read loses its handler: typed refusal must not be mistaken
    # for preservation of a capability the declared adapter scope promises.
    perl -0pi -e 's/handlers\.set\("get-context-paths"/handlers.set("get-context-paths-planted"/' shell/host.js
    expect_fail node tools/contract_shapes.mjs --check ;;
  live)
    # A kappa that ignores what a node says: an edited rule keeps its old kappa, so the frame never redraws it.
    cp shell/live/project.mjs /tmp/plant-project.mjs
    sed -i 's/kappa: kappaOfValue({ kind: n.kind, data: n.data })/kappa: kappaOfValue({ kind: n.kind })/' shell/live/project.mjs
    expect_fail node tools/live_preview.mjs --check
    cp /tmp/plant-project.mjs shell/live/project.mjs ;;
  shadcn)
    # A component edited in place: the frame would no longer be shadcn/ui as the kit vendors it.
    cp vendor/shadcn-ui/registry/new-york-v4/ui/button.tsx /tmp/plant-button.tsx
    sed -i 's/rounded-md text-sm font-medium/rounded-full text-sm font-medium/' vendor/shadcn-ui/registry/new-york-v4/ui/button.tsx
    expect_fail node tools/live_components.mjs --check
    cp /tmp/plant-button.tsx vendor/shadcn-ui/registry/new-york-v4/ui/button.tsx ;;
  kitfile)
    # A component written here and dropped beside the kit's: it would read as shadcn/ui and not be.
    printf 'export function Fancy() { return null }
' > vendor/shadcn-ui/registry/new-york-v4/ui/fancy.tsx
    expect_fail node tools/live_components.mjs --check
    rm -f vendor/shadcn-ui/registry/new-york-v4/ui/fancy.tsx ;;
  rolled)
    # A screen that reaches for a primitive library itself instead of the kit's component.
    cp vendor/dyad/src/pages/home.tsx /tmp/plant-home.tsx
    sed -i '1i import { Tooltip as Rolled } from "@base-ui/react/tooltip"; console.log(Rolled);' vendor/dyad/src/pages/home.tsx
    expect_fail bash -c 'cd vendor/dyad && MSYS_NO_PATHCONV=1 npx vite build --config vite.shell.config.mts --base /foundry/ --outDir /tmp/plant-dist --emptyOutDir'
    cp /tmp/plant-home.tsx vendor/dyad/src/pages/home.tsx ;;
  rewrite)
    # A Base UI render prop given a call, not an element: Radix's asChild cannot take it.
    cp vendor/dyad/src/components/chat/AttachmentsList.tsx /tmp/plant-attachments.tsx
    sed -i 's#<TooltipTrigger render={<div className="flex" />}>#<TooltipTrigger render={wrap()}>#' vendor/dyad/src/components/chat/AttachmentsList.tsx
    expect_fail bash -c 'cd vendor/dyad && node hologram.typecheck.mjs'
    cp /tmp/plant-attachments.tsx vendor/dyad/src/components/chat/AttachmentsList.tsx ;;
  passage)
    # An upstream edit to the layout the shell puts in the sidebar's inset: the patch must not silently miss.
    cp vendor/dyad/src/app/layout.tsx /tmp/plant-layout.tsx
    sed -i 's/<SubscriptionStatusBanner \/>/<SubscriptionStatusBanner compact \/>/' vendor/dyad/src/app/layout.tsx
    expect_fail bash -c 'cd vendor/dyad && node hologram.typecheck.mjs'
    cp /tmp/plant-layout.tsx vendor/dyad/src/app/layout.tsx ;;
  table)
    # A table that answers differently from the rules: every answer, guarantee and diff built on it is wrong.
    cp shell/live/table.mjs /tmp/plant-table.mjs
    sed -i 's/mask\[k\] = test(probe) ? 1 : 0;/mask[k] = test(probe) ? 0 : 1;/' shell/live/table.mjs
    expect_fail node tools/live_table.mjs --check
    cp /tmp/plant-table.mjs shell/live/table.mjs ;;
  edit)
    # An editor that keeps whatever it is given: a click could leave rules that do not check.
    cp shell/live/edit.mjs /tmp/plant-edit.mjs
    sed -i 's/      if (!verdict.ok) return/      if (false) return/' shell/live/edit.mjs
    expect_fail node tools/live_edit.mjs --check
    cp /tmp/plant-edit.mjs shell/live/edit.mjs ;;
  look)
    # The build screen, with no look chosen there, borrowing the home look (Immersive, or Light) instead of
    # opening Dark: the default the user asked for, quietly gone, and every screen still draws.
    perl -pi -e 's/readJson\(BUILD_KEY\) \|\| \{ palette: "dark", immersive: false \}/readJson(BUILD_KEY) || home/' shell/appearance.js
    grep -q 'readJson(BUILD_KEY) || home;' shell/appearance.js || { echo "anchor not found"; exit 1; }
    expect_fail node tools/build_look.mjs ;;
  *) echo "usage: $0 words|grant|bytes|shell|publish|evidence|composer|brand|token|hand|parse|hole|live|shadcn|kitfile|rolled|rewrite|passage|table|edit|look" >&2; exit 2 ;;
esac
restore
echo "restored"
