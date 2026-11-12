// Checks every corpus case with the in-tab checker (here in Node, the same files a worker runs) and compares it with
// the SDK image's recorded result. Run directly, it prints the table and writes agreement.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./checker.mjs";
import { cases } from "../hosted-check/corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const manifest = (variant = "") => JSON.parse(readFileSync(join(here, `checker${variant}.json`), "utf8"));
export const image = () => JSON.parse(readFileSync(join(here, "..", "hosted-check", "image-results.json"), "utf8"));
export function checkerBytes(variant = "") {
  try { return readFileSync(join(here, "dist", `lexlean-tab${variant}.wasm`)); }
  catch { throw new Error(`v2/in-tab-check/dist/lexlean-tab${variant}.wasm is absent: build it with "bash v2/in-tab-check/build.sh" (it is not committed)`); }
}
export const fromDisk = ({ variant = "", ...options } = {}) => load({ wasm: checkerBytes(variant), pack: readFileSync(join(here, "pack.json")), manifest: manifest(variant), ...options });
const key = (d) => `${d.code} ${d.path}:${d.line}:${d.column}-${d.endLine}:${d.endColumn} ${d.message}`;

export async function compareAll(checker, scope = "author") {
  const want = image(), rows = [];
  for (const c of cases()) {
    const got = await checker.check(c.spec, { extras: c.extras, scope });
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
  const variant = process.argv[2] ?? "";
  const checker = await fromDisk({ variant });
  console.log(JSON.stringify(checker.by), JSON.stringify(checker.loadMs), `warm ${checker.warm().toFixed(0)} ms`);
  const all = await compareAll(checker, "all"), rows = await compareAll(checker, "author");
  for (const r of rows) { const a = all.find((x) => x.id === r.id); r.msAll = a.ms; r.identicalAll = a.identical && a.verdictAgrees; }
  writeFileSync(join(here, `agreement${variant}.json`), JSON.stringify({ by: checker.by, image: image().image, imageVersion: image().version, rows }, null, 1) + "\n");
  for (const r of rows) console.log(`${r.id.padEnd(34)} image ${r.image ? "accept" : "refuse"}  tab ${r.tab ? "accept" : "refuse"}  ${r.verdictAgrees ? "agree" : "DISAGREE"}  ${r.identical ? "identical" : "DIFF " + JSON.stringify(r.differences)}  ${r.imageCodes.join(",")}  ${r.ms} ms  (scope all: ${r.identicalAll ? "identical" : "DIFF"}, ${r.msAll} ms)`);
}
