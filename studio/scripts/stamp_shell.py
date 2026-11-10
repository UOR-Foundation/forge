"""Place the renderer's built output beside the shell, and stage the scaffold beside it.

The homepage is shell/index.html, projected by the core from the verified View; it references the
renderer's assets by fixed names (vendor/dyad/vite.shell.config.mts, ours). This script copies the Vite output
under shell/assets/, writes shell/404.html as a copy of the homepage so Pages answers a refresh on any
of the renderer's routes with the app (the router reads the URL), and stages the renderer's scaffold with a file list,
which the host creates apps from. Run after the Vite build: python3 scripts/stamp_shell.py
"""
import json, pathlib, re, shutil

root = pathlib.Path(__file__).resolve().parent.parent
dist = root / "vendor" / "dyad" / "dist" / "assets"
assets = root / "shell" / "assets"
if not dist.is_dir():
    raise SystemExit(f"{dist} is missing: run the Vite build first (see vendor/dyad/vite.shell.config.mts)")
if assets.exists():
    shutil.rmtree(assets)
shutil.copytree(dist, assets)
for stale in ("app",):
    if (root / "shell" / stale).exists():
        shutil.rmtree(root / "shell" / stale)
index = (root / "shell" / "index.html").read_text(encoding="utf-8")
(root / "shell" / "404.html").write_text(index, encoding="utf-8", newline="\n")
print(f"placed {sum(1 for p in assets.rglob('*') if p.is_file())} renderer files under shell/assets and wrote shell/404.html")

src = root / "vendor" / "dyad" / "scaffold"
dst = root / "shell" / "scaffold"
if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src / "src", dst / "src")
for name in ("package.json", "tailwind.config.ts", "index.html", "AI_RULES.md"):
    if (src / name).exists():
        shutil.copy(src / name, dst / name)
# The product is Hologram: the staged scaffold's words say so (the badge, the link); the vendored tree is untouched.
WORD = re.compile(r"\bDyad\b")
for p in dst.rglob("*"):
    if p.is_file() and p.suffix in (".tsx", ".ts", ".md", ".html", ".json"):
        text = p.read_text(encoding="utf-8")
        new = WORD.sub("Hologram", text).replace("https://www.dyad.sh/", "https://gethologram.ai/")
        if new != text:
            p.write_text(new, encoding="utf-8", newline="\n")
# Every app built here wears the Hologram brand kit (the host adds shell/scaffold-brand.css to its page), so
# the model is told to style through the theme, not around it.
rules = dst / "AI_RULES.md"
rules.write_text(rules.read_text(encoding="utf-8").rstrip("\n") + "\n\n## Brand\n\n- The app wears the Hologram brand kit: its colours, fonts and radius are set for you. Use the shadcn/ui components and the theme classes (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, `bg-card`, `text-destructive`); never raw palette colours (`bg-blue-500`), hex values, or a new `:root` theme.\n", encoding="utf-8", newline="\n")
app = dst / "src" / "App.tsx"
app.write_text(app.read_text(encoding="utf-8").replace("<BrowserRouter>", "<BrowserRouter basename={import.meta.env.BASE_URL}>", 1), encoding="utf-8", newline="\n")
files = sorted(str(p.relative_to(dst)).replace("\\", "/") for p in (dst / "src").rglob("*") if p.is_file())
(dst / "files.json").write_text(json.dumps(files), encoding="utf-8", newline="\n")
print(f"staged {len(files)} scaffold files")
