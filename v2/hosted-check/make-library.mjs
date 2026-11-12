// Writes library.json: which library modules exist and where their sources are, and the title phrases of the SDK's
// prism.arch lexicon. Both come from copies that were compared byte for byte with the pinned SDK image (REPORT.md).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, "..", "probe-payment");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

const modules = {};
for (const file of walk(join(project, "src", "Foundation"))) {
  const name = readFileSync(file, "utf8").match(/^\\begin\{lexlean\}\{([^}]+)\}/)[1];
  modules[name] = relative(here, file).split("\\").join("/");
}

// Every entry is checked to have the same shape as the substitute, because substitution is sound only between
// phrases the title rule cannot tell apart: a sentence-case, singular, zero-arity atom label.
const titles = [];
for (const file of walk(join(project, "language", "prism.arch", "entries"))) {
  const t = readFileSync(file, "utf8");
  const shape = [/^category = "label-word"$/m, /^frame = "atom"$/m, /^surface_arity = 0$/m, /^features = \["sentence-case", "singular"\]$/m];
  if (!shape.every((r) => r.test(t))) throw new Error(`unexpected entry shape: ${file}`);
  titles.push(t.match(/^surface = "([^"]+)"$/m)[1]);
}
titles.sort();

const lock = readFileSync(join(here, "..", "..", "prismpm.lock"), "utf8");
const image = lock.match(/"sdk_image":"([^"]+)"/)[1];
writeFileSync(join(here, "library.json"), JSON.stringify({ image, modules, titles }, null, 1) + "\n");
console.log(`${Object.keys(modules).length} modules, ${titles.length} titles`);
