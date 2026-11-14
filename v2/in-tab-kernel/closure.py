"""The import closure of the driver: every Lean module whose compiled C the checker links.

  python3 closure.py <lean4 source root (src/)> <driver dir> <lean4export dir>  ->  one module per line, sorted

Imports are read from each file's header (`import`, `public import`, `meta import`, `import all`, and combinations).
A module of Init, Std or Lean is read from the pinned Lean source; Export.* from lean4export; Checker from the driver.
"""
import pathlib, re, sys

src, driver, export = (pathlib.Path(p) for p in sys.argv[1:4])
IMPORT = re.compile(r"^(?:public\s+|private\s+)?(?:meta\s+)?import\s+(?:all\s+)?([A-Za-z0-9_.]+)")


def path_of(module):
    rel = pathlib.Path(*module.split(".")).with_suffix(".lean")
    root = module.split(".")[0]
    if root == "Checker": return driver / rel
    if root == "Export": return export / rel
    return src / rel


def imports(module):
    found, in_comment = [], False
    text = path_of(module).read_text(encoding="utf-8")
    prelude = False
    for line in text.splitlines():
        s = line.strip()
        if in_comment:
            if "-/" in s: in_comment = False
            continue
        if s.startswith("/-"):
            if "-/" not in s: in_comment = True
            continue
        if not s or s.startswith("--") or s == "module": continue
        if s == "prelude": prelude = True; continue
        m = IMPORT.match(s)
        if not m: break
        found.append(m.group(1))
    # A file without `prelude` imports Init implicitly.
    if not prelude and module.split(".")[0] not in ("Init",): found.append("Init")
    return found


seen, todo = set(), ["Checker"]
while todo:
    m = todo.pop()
    if m in seen: continue
    seen.add(m)
    todo.extend(imports(m))
print("\n".join(sorted(seen)))
