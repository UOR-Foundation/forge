// Checks every corpus case on the hosted route and compares it with the image's recorded result.
// Run directly, it prints the agreement table and writes agreement.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, loadLibrary } from "./check.mjs";
import { cases } from "./corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const libraryFromDisk = () => loadLibrary(async (p) => readFileSync(join(here, p), "utf8"));
const key = (d) => `${d.code} ${d.path}:${d.line}:${d.column}-${d.endLine}:${d.endColumn} ${d.message}`;

export async function compareAll() {
  const library = await libraryFromDisk();
  const image = JSON.parse(readFileSync(join(here, "image-results.json"), "utf8"));
  const rows = [];
  for (const c of cases()) {
    const hosted = await check(c.spec, { library, extras: c.extras });
    const want = image.cases[c.id];
    const got = hosted.diagnostics;
    const a = want.diagnostics.map(key).sort(), b = got.map(key).sort();
    rows.push({
      id: c.id, image: want.ok, hosted: hosted.ok, verdictAgrees: want.ok === hosted.ok,
      imageCodes: want.diagnostics.map((d) => d.code), hostedCodes: got.map((d) => d.code),
      identical: JSON.stringify(a) === JSON.stringify(b),
      differences: { imageOnly: a.filter((x) => !b.includes(x)), hostedOnly: b.filter((x) => !a.includes(x)) },
      ms: hosted.ms,
    });
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await compareAll();
  writeFileSync(join(here, "agreement.json"), JSON.stringify(rows, null, 1) + "\n");
  for (const r of rows) console.log(`${r.id.padEnd(30)} image ${r.image ? "accept" : "refuse"}  hosted ${r.hosted ? "accept" : "refuse"}  ${r.verdictAgrees ? "agree" : "DISAGREE"}  ${r.identical ? "identical" : "DIFF " + JSON.stringify(r.differences)}  ${r.imageCodes.join(",")}`);
}
