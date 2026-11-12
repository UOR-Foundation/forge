// Checks every corpus case with the in-tab checker (here in Node, the same files a worker runs) and compares it with
// the SDK image's recorded result. Run directly, it prints the table and writes agreement.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./checker.mjs";
import { cases } from "../hosted-check/corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const manifest = () => JSON.parse(readFileSync(join(here, "checker.json"), "utf8"));
export const image = () => JSON.parse(readFileSync(join(here, "..", "hosted-check", "image-results.json"), "utf8"));
export function checkerBytes() {
  try { return readFileSync(join(here, "dist", "lexlean-tab.wasm")); }
  catch { throw new Error("v2/in-tab-check/dist/lexlean-tab.wasm is absent: build it with `bash v2/in-tab-check/build.sh` (it is not committed)"); }
}
export const fromDisk = (options = {}) => load({ wasm: checkerBytes(), pack: readFileSync(join(here, "pack.json")), manifest: manifest(), ...options });
const key = (d) => `${d.code} ${d.path}:${d.line}:${d.column}-${d.endLine}:${d.endColumn} ${d.message}`;

export async function compareAll(checker) {
  const want = image(), rows = [];
  for (const c of cases()) {
    const got = await checker.check(c.spec, { extras: c.extras });
    const w = want.cases[c.id];
    const a = w.diagnostics.map(key).sort(), b = got.diagnostics.map(key).sort();
    rows.push({
      id: c.id, image: w.ok, tab: got.ok, verdictAgrees: w.ok === got.ok,
      imageCodes: w.diagnostics.map((d) => d.code), tabCodes: got.diagnostics.map((d) => d.code),
      identical: JSON.stringify(a) === JSON.stringify(b),
      differences: { imageOnly: a.filter((x) => !b.includes(x)), tabOnly: b.filter((x) => !a.includes(x)) },
      ms: Math.round(got.ms.total * 10) / 10,
    });
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checker = await fromDisk();
  console.log(JSON.stringify(checker.by), JSON.stringify(checker.loadMs), `warm ${checker.warm().toFixed(0)} ms`);
  const rows = await compareAll(checker);
  writeFileSync(join(here, "agreement.json"), JSON.stringify({ by: checker.by, image: image().image, imageVersion: image().version, rows }, null, 1) + "\n");
  for (const r of rows) console.log(`${r.id.padEnd(34)} image ${r.image ? "accept" : "refuse"}  tab ${r.tab ? "accept" : "refuse"}  ${r.verdictAgrees ? "agree" : "DISAGREE"}  ${r.identical ? "identical" : "DIFF " + JSON.stringify(r.differences)}  ${r.imageCodes.join(",")}  ${r.ms} ms`);
}
