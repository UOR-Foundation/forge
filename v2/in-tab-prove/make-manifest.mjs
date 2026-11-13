// Records what a tab may run and what it was measured on, by address: the checker's bytes and every export in
// dist/exports. The built files are not committed; build.sh, capture-staging.sh and make-exports.sh make them.
//   node make-manifest.mjs --write | --check
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { brotliCompressSync, gzipSync } from "node:zlib";

const here = new URL(".", import.meta.url);
const describe = (path) => {
  const bytes = readFileSync(new URL(path, here));
  return { address: "sha256:" + createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes).length };
};
const manifest = {
  checker: { file: "dist/kernel-tab.wasm", ...describe("dist/kernel-tab.wasm"), source: { nanoda_lib: "0da9f98feadd3a0a2ef4b3dbcf52a298a6fef929", version: "0.4.32", wrapper: "crate/", rust: "1.97.1", target: "wasm32-wasip1" } },
  exporter: { lean4export: "86e4a339507466921dc8c5417c8cb1de1ce7df60", format: "3.1.0", lean: "4.32.1", githash: "f054605aea4b840552cca2e725580bffd1e1b704" },
  permitted_axioms: ["Classical.choice", "Quot.sound", "propext"],
  exports: Object.fromEntries(readdirSync(new URL("dist/exports/", here)).filter((n) => n.endsWith(".ndjson")).sort().map((n) => [n.replace(/\.ndjson$/, ""), describe("dist/exports/" + n)])),
};
// How many declarations the library export holds: counted by a full check of it, which must accept.
const { load, check } = await import("./kernel.mjs");
const counted = check(await load(readFileSync(new URL("dist/kernel-tab.wasm", here))), readFileSync(new URL("dist/exports/library.ndjson", here)), { permitted_axioms: manifest.permitted_axioms });
if (!counted.ok) { console.error("the library export does not check: " + counted.refusal); process.exit(1); }
manifest.library = { address: manifest.exports.library.address, bytes: manifest.exports.library.bytes, declarations: counted.declarations };
const text = JSON.stringify(manifest, null, 1) + "\n";
if (process.argv[2] === "--write") { writeFileSync(new URL("manifest.json", here), text); console.log("wrote manifest.json"); }
else if (readFileSync(new URL("manifest.json", here), "utf8") !== text) { console.error("manifest.json does not describe the built files"); process.exit(1); }
else console.log("manifest.json describes the built files");
