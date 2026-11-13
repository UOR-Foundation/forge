// Runs the WebAssembly checker under Node on every input in a folder, two ways, and writes one JSON file.
//   whole     a fresh instance judges the whole file, every declaration, as the native run does.
//   resident  one instance holds the pinned library, admitted by its address; each input must begin with the
//             library's bytes, and only what follows them is judged.
//   node run-wasm.mjs <dist dir> <inputs dir> <library.ndjson> <out.json> [--resident-only]
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const [dist, inputs, libraryPath, out, flag] = process.argv.slice(2);
const factory = (await import(pathToFileURL(path.resolve(dist, "lean-kernel.mjs")).href)).default;
const wasmBinary = fs.readFileSync(path.resolve(dist, "lean-kernel.wasm"));
const library = fs.readFileSync(libraryPath);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const heapMB = (m) => Math.round(m.HEAPU8.length / 1048576);

async function instance(lines) {
  const t0 = performance.now();
  const m = await factory({ wasmBinary, print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
  const ready = m.ccall("checker_ready", "number", [], []);
  if (ready !== 0) throw new Error("the checker did not initialize: " + lines.join(" "));
  return { m, readyMs: Math.round(performance.now() - t0) };
}
function call(m, lines, entry, file, bytes) {
  m.FS.writeFile(file, bytes);
  const t0 = performance.now();
  let exit;
  try { exit = m.ccall(entry, "number", ["string"], [file]); }
  catch (e) { exit = 3; lines.push("trap: " + (e && e.message ? e.message : String(e))); }
  m.FS.unlink(file);
  return { exit, ms: Math.round(performance.now() - t0) };
}

const files = fs.readdirSync(inputs).filter((f) => f.endsWith(".ndjson")).sort();
const result = { checker: { wasm: sha(wasmBinary), bytes: wasmBinary.length }, library: { sha256: sha(library), bytes: library.length }, whole: {}, resident: { inputs: {} } };

if (flag !== "--resident-only") for (const f of files) {
  const lines = [];
  const { m, readyMs } = await instance(lines);
  const r = call(m, lines, "check_whole", "/input.ndjson", fs.readFileSync(path.join(inputs, f)));
  result.whole[f.replace(/\.ndjson$/, "")] = { accepted: r.exit === 0, exit: r.exit, readyMs, ms: r.ms, heapMB: heapMB(m), output: lines.join("\n").slice(-400) };
  console.log(`whole    ${f.slice(0, 12)} exit ${r.exit} ready ${readyMs} ms check ${r.ms} ms heap ${heapMB(m)} MB: ${lines.join(" ").slice(-100)}`);
}

{
  const lines = [];
  const { m, readyMs } = await instance(lines);
  const load = call(m, lines, "load_library", "/library.ndjson", library);
  Object.assign(result.resident, { readyMs, loadExit: load.exit, loadMs: load.ms, heapAfterLoadMB: heapMB(m), loadOutput: lines.join("\n") });
  console.log(`resident library exit ${load.exit} ready ${readyMs} ms load ${load.ms} ms heap ${heapMB(m)} MB: ${lines.join(" ")}`);
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(inputs, f));
    const name = f.replace(/\.ndjson$/, "");
    if (bytes.length < library.length || !bytes.subarray(0, library.length).equals(library)) {
      result.resident.inputs[name] = { accepted: false, exit: 1, ms: 0, output: "Refused: the input does not begin with the pinned library" };
      console.log(`resident ${f.slice(0, 12)} refused: not over the pinned library`);
      continue;
    }
    lines.length = 0;
    const times = [];
    let r;
    for (let i = 0; i < 5; i++) { r = call(m, lines, "check_suffix", "/suffix.ndjson", bytes.subarray(library.length)); times.push(r.ms); }
    times.sort((a, b) => a - b);
    result.resident.inputs[name] = { accepted: r.exit === 0, exit: r.exit, ms: times[2], worstMs: times[4], suffixBytes: bytes.length - library.length, heapMB: heapMB(m), output: lines[lines.length - 1].slice(-400) };
    console.log(`resident ${f.slice(0, 12)} exit ${r.exit} median ${times[2]} ms worst ${times[4]} ms heap ${heapMB(m)} MB: ${lines[lines.length - 1].slice(-100)}`);
  }
}
fs.writeFileSync(out, JSON.stringify(result, null, 1));
