// Makes what the tab is served, from the exports in dist/ (made by the predecessor's capture of the SDK image's own
// elaboration, see REPORT.md): each project's own part of its bundle, the manifest, and the records a prover would
// publish. Run after copying library.ndjson, guests.whole.ndjson, payment.whole.ndjson and kernel-tab.wasm to dist/.
//   node make-dist.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256, keyOf, toolchainPreimage } from "./records.mjs";

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const read = (p) => readFileSync(join(here, p));
const library = read("dist/library.ndjson"), wasm = read("dist/kernel-tab.wasm");
const manifest = { lean: "4.32.1 f054605aea4b840552cca2e725580bffd1e1b704", emitter: "prism/serverless-prove/emit/1", checker: await sha256(wasm), library: await sha256(library) };
const toolchain = await sha256(toolchainPreimage(manifest));
const records = [];
for (const name of ["guests", "payment"]) {
  const whole = read(`dist/${name}.whole.ndjson`);
  if (Buffer.compare(whole.subarray(0, library.length), library) !== 0) throw new Error(`${name}: the library is not a prefix`);
  const suffix = whole.subarray(library.length);
  writeFileSync(join(here, `dist/${name}.suffix.ndjson`), suffix);
  const bundle = await sha256(suffix);
  const src = JSON.parse(read(`corpus/${name}/data/source.json`));
  const spec = { prefix: JSON.parse(read(`corpus/${name}/spec.json`)).module_prefix, modules: Object.fromEntries(src.modules.map((m) => [m, JSON.parse(read(`corpus/${name}/data/${m}.json`))])) };
  for (const [m, d] of Object.entries(spec.modules)) for (const t of d.declarations.filter((x) => x.kind === "theorem")) {
    const theorem = `${spec.prefix}.${m}.${t.name}`;
    records.push({ key: await keyOf(spec, theorem, toolchain), theorem, bundle, suffix: `${name}.suffix.ndjson` });
  }
  console.log(name, "suffix", suffix.length, "bytes", bundle);
}
writeFileSync(join(here, "dist/manifest.json"), JSON.stringify({ ...manifest, toolchain }, null, 1) + "\n");
writeFileSync(join(here, "dist/records.json"), JSON.stringify(records, null, 1) + "\n");
// The bench's edits of guests: startsEmpty restated as a true and as a false statement about the revision, both
// closed by reflexivity, so the tab makes the proof itself.
const app = JSON.parse(read("corpus/guests/data/App.json"));
for (const [tag, value] of [["edit-true", "0"], ["edit-false", "1"]]) {
  const copy = structuredClone(app), t = copy.declarations.find((d) => d.name === "startsEmpty");
  t.statement = { kind: "eq", left: { kind: "project", field: "revision", value: { kind: "call", function: { name: "initial" }, arguments: [] } }, right: { kind: "nat", value } };
  writeFileSync(join(here, `dist/guests.App.${tag}.json`), JSON.stringify(copy) + "\n");
}
console.log(records.length, "records", "toolchain", toolchain);
