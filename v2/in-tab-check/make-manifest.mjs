// checker.json names the checker a tab may run: the address of its bytes, the address of the library pack, and the
// LexLean it must report. The LexLean identity is copied from what the SDK image said of itself
// (v2/hosted-check/image-results.json), never from the built binary, so a build of another LexLean cannot name itself.
//   node make-manifest.mjs --write   records dist/lexlean-tab.wasm as the checker
//   node make-manifest.mjs --check   fails unless dist/lexlean-tab.wasm and pack.json are the ones recorded
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, brotliCompressSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, ...p));
const address = (bytes) => "sha256:" + createHash("sha256").update(bytes).digest("hex");

export function describe() {
  const wasm = read("dist", "lexlean-tab.wasm"), pack = read("pack.json");
  const image = JSON.parse(read("..", "hosted-check", "image-results.json"));
  return {
    spec: "foundry/in-tab-checker/1",
    checker: address(wasm),
    checker_bytes: wasm.length,
    checker_gzip_bytes: gzipSync(wasm, { level: 9 }).length,
    checker_brotli_bytes: brotliCompressSync(wasm).length,
    pack: address(pack),
    pack_bytes: pack.length,
    pack_gzip_bytes: gzipSync(pack, { level: 9 }).length,
    lexlean: { version: image.version.match(/^lexlean (\S+)/m)[1], semantics: image.version.match(/^compiler-semantics (\S+)/m)[1] },
    source: {
      repository: "https://github.com/UOR-Foundation/PrismPM",
      commit: "35e9f01d5415ed4b0b64c152238f291546957ec4",
      crate: "vendor/lexlean",
      patch: address(read("upstream", "wasm-check.patch")),
      wrapper: address(Buffer.concat([read("crate", "Cargo.toml"), read("crate", "Cargo.lock"), read("crate", "src", "lib.rs")])),
      build: address(read("build.sh")),
      rust: "1.97.1",
      target: "wasm32-wasip1",
    },
    image: image.image,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = describe();
  if (process.argv.includes("--write")) {
    writeFileSync(join(here, "checker.json"), JSON.stringify(now, null, 1) + "\n");
    console.log(`checker.json: ${now.checker}, ${now.checker_bytes} bytes (${now.checker_gzip_bytes} gzip, ${now.checker_brotli_bytes} brotli)`);
  } else {
    const kept = JSON.parse(read("checker.json"));
    const differing = Object.keys(now).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(kept[k]));
    if (differing.length) { console.error(`checker.json does not describe these files: ${differing.join(", ")} differ`); process.exit(1); }
    console.log("checker.json describes the built checker and its sources");
  }
}
