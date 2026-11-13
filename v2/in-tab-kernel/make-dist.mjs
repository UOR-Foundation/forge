// Assembles dist/ (not committed): the kernel, its loader, the pinned library, each input's suffix, and a manifest
// that names every file by its SHA-256 with the verdict native Lean gave (evidence/native.json).
//   node make-dist.mjs <built dist dir> <inputs dir> <library.ndjson>
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const [built, inputs, libraryPath] = process.argv.slice(2);
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "dist");
fs.mkdirSync(out, { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const native = JSON.parse(fs.readFileSync(path.join(here, "evidence", "native.json"), "utf8"));
const entry = (file, bytes) => { fs.writeFileSync(path.join(out, file), bytes); return { file, sha256: sha(bytes), bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length }; };

const library = fs.readFileSync(libraryPath);
const manifest = {
  lean: { version: "4.32.1", commit: "f054605aea4b840552cca2e725580bffd1e1b704" },
  glue: entry("lean-kernel.mjs", fs.readFileSync(path.join(built, "lean-kernel.mjs"))),
  wasm: entry("lean-kernel.wasm", fs.readFileSync(path.join(built, "lean-kernel.wasm"))),
  library: entry("library.ndjson", library),
  inputs: [],
};
for (const f of fs.readdirSync(inputs).filter((f) => f.endsWith(".ndjson")).sort()) {
  const bytes = fs.readFileSync(path.join(inputs, f));
  const name = f.replace(/\.ndjson$/, "");
  if (!bytes.subarray(0, library.length).equals(library)) throw new Error(f + " does not begin with the library");
  const suffix = bytes.subarray(library.length);
  manifest.inputs.push({ sha256: name, file: name.slice(0, 16) + ".suffix.ndjson", suffixSha256: sha(suffix), suffixBytes: suffix.length, suffixGzipBytes: gzipSync(suffix, { level: 9 }).length, accepted: native[name].accepted });
  fs.writeFileSync(path.join(out, name.slice(0, 16) + ".suffix.ndjson"), suffix);
}
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
console.log(JSON.stringify({ glue: manifest.glue, wasm: manifest.wasm, library: manifest.library, inputs: manifest.inputs.length }, null, 1));
