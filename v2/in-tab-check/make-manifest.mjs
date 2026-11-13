// checker.json names the checker a tab may run: the address of its bytes, the address of the library pack, and the
// LexLean it must report. The LexLean identity is copied from what the SDK image said of itself
// (v2/hosted-check/image-results.json), never from the built binary, so a build of another LexLean cannot name itself.
// checker-lean.json is the same for the lean checker: the same source built with upstream/lean-embed.patch as well,
// which leaves out the bytes of the preservation library and carries the language-1.2 identity the image's lock records.
//   node make-manifest.mjs --write   records the files in dist/ as the checkers
//   node make-manifest.mjs --check   fails unless dist/ and pack.json hold the ones recorded
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, brotliCompressSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, ...p));
const address = (bytes) => "sha256:" + createHash("sha256").update(bytes).digest("hex");
export const variants = ["", "-lean"];

export function describe(variant = "") {
  const wasm = read("dist", `lexlean-tab${variant}.wasm`), pack = read("pack.json");
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
      patches: ["wasm-check.patch", ...(variant ? ["lean-embed.patch"] : [])].map((p) => address(read("upstream", p))),
      // The identity the lean build carries instead of computing: the one in the lock the image wrote.
      ...(variant ? { semantics_1_2: read("..", "probe-payment", "lexlean.lock").toString().match(/^compiler_semantics = "([0-9a-f]{64})"/m)[1] } : {}),
      wrapper: address(Buffer.concat([read("crate", "Cargo.toml"), read("crate", "Cargo.lock"), read("crate", "src", "lib.rs")])),
      build: address(read("build.sh")),
      rust: "1.97.1",
      target: "wasm32-wasip1",
    },
    image: image.image,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = false;
  for (const variant of variants) {
    const now = describe(variant), name = `checker${variant}.json`;
    if (process.argv.includes("--write")) {
      writeFileSync(join(here, name), JSON.stringify(now, null, 1) + "\n");
      console.log(`${name}: ${now.checker}, ${now.checker_bytes} bytes (${now.checker_gzip_bytes} gzip, ${now.checker_brotli_bytes} brotli)`);
    } else {
      const kept = JSON.parse(read(name));
      const differing = Object.keys(now).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(kept[k]));
      if (differing.length) { console.error(`${name} does not describe these files: ${differing.join(", ")} differ`); failed = true; }
      else console.log(`${name} describes the built checker and its sources`);
    }
  }
  if (failed) process.exit(1);
}
