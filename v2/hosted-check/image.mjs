// Records the authority's verdicts: runs `lexlean check --all` in the pinned SDK image on every corpus case, each as
// its own project holding the library copies, and writes image-results.json. Needs WSL with Docker (Windows only).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { cases } from "./corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scaffold = join(here, "..", "probe-payment");
const work = join(tmpdir(), "hosted-check-image");
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "out"), { recursive: true });
for (const f of ["lakefile.toml", "lake-manifest.json", "lean-toolchain", "language", "build-local.sh"]) cpSync(join(scaffold, f), join(work, f), { recursive: true });
cpSync(join(here, "..", "..", "prismpm.lock"), join(work, "prismpm.lock"));
cpSync(join(scaffold, "lexlean.toml"), join(work, "lexlean.toml.orig"));
cpSync(join(scaffold, "src", "Foundation"), join(work, "lib", "Foundation"), { recursive: true });
for (const c of cases()) for (const f of c.files) cpSync(join(here, "corpus", c.id, f), join(work, "corpus", c.id.split("/").join("__"), f));

writeFileSync(join(work, "run.sh"), `#!/bin/sh
set -u
lexlean --version > out/version.txt 2>&1
root=/opt/prismpm/share/conformance-root
: > out/library.txt
for f in $(cd lib && find Foundation -name '*.lex.tex'); do cmp -s "lib/$f" "$root/stdlib/src/$f" && echo "same $f" >> out/library.txt || echo "differs $f" >> out/library.txt; done
diff -r language/prism.arch $root/language/prism.arch > /dev/null && echo "same prism.arch" >> out/library.txt || echo "differs prism.arch" >> out/library.txt
for dir in corpus/*; do
  name=$(basename "$dir")
  rm -rf src .lexlean lexlean.lock; mkdir -p src; cp -r lib/Foundation src/; cp "$dir"/*.lex.tex src/
  entry=src/App.lex.tex; [ -f src/Payment.lex.tex ] && entry=src/Payment.lex.tex
  sed "s#^entrypoints = .*#entrypoints = [\\"$entry\\"]#" lexlean.toml.orig > lexlean.toml
  lexlean lock > /dev/null 2>&1
  lexlean --diagnostic-format json check --all > "out/$name.json" 2> /dev/null
done
`);

const wsl = "/mnt/" + work[0].toLowerCase() + work.slice(2).split("\\").join("/");
execFileSync("wsl", ["-d", "Ubuntu", "--", "bash", `${wsl}/build-local.sh`, "sh run.sh"], { cwd: work, stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });

const results = { image: readFileSync(join(work, "prismpm.lock"), "utf8").match(/"sdk_image":"([^"]+)"/)[1], version: readFileSync(join(work, "out", "version.txt"), "utf8").trim(), library: readFileSync(join(work, "out", "library.txt"), "utf8").trim().split("\n"), cases: {} };
for (const c of cases()) {
  const file = join(work, "out", c.id.split("/").join("__") + ".json");
  if (!existsSync(file)) throw new Error(`no image result for ${c.id}`);
  const r = JSON.parse(readFileSync(file, "utf8"));
  results.cases[c.id] = { ok: r.success, diagnostics: r.diagnostics.map((d) => ({ code: d.code, message: d.message, path: d.primary?.path, line: d.primary?.line_start, column: d.primary?.column_start, endLine: d.primary?.line_end, endColumn: d.primary?.column_end })) };
}
writeFileSync(join(here, "image-results.json"), JSON.stringify(results, null, 1) + "\n");
console.log(`recorded ${Object.keys(results.cases).length} cases from the image`);
