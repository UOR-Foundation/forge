// Builds pack.json: every file a check needs besides the author's modules. The project files and the library come
// from v2/probe-payment, whose library copies are byte for byte the SDK image's (v2/hosted-check/image-results.json).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "probe-payment");
const files = {};
const walk = (rel) => {
  for (const e of readdirSync(join(from, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(path);
    else files[path] = readFileSync(join(from, path), "utf8");
  }
};
for (const f of ["lakefile.toml", "lake-manifest.json", "lean-toolchain", "lexlean.toml"]) files[f] = readFileSync(join(from, f), "utf8");
walk("language");
walk("src/Foundation");
for (const [path, text] of Object.entries(files)) if (text.includes("\r")) throw new Error(`${path} has a carriage return; the image's copy has none`);
const image = readFileSync(join(here, "..", "..", "prismpm.lock"), "utf8").match(/"sdk_image":"([^"]+)"/)[1];
writeFileSync(join(here, "pack.json"), JSON.stringify({ spec: "foundry/in-tab-check-pack/1", image, files }) + "\n");
console.log(`pack.json: ${Object.keys(files).length} files`);
