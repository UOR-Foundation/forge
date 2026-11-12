// Holds the interpreter to a compiled guest: the same requests go through the holo's WebAssembly
// guest (loaded and verified by prism-code) and through the interpreter running the data form of
// the same model, and every pair of answers must be byte for byte equal.
//
// Run: node compare.mjs <app.holo> <data dir> <Module::dispatch> [sweep module]
// Exit 0: every answer agreed. Exit 1: at least one differed. Exit 2: could not compare.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "prism-code";
import { loadProject, toArray } from "../shell/interp.mjs";

const [holoArg, dataArg, entry, sweepArg] = process.argv.slice(2);
if (!holoArg || !dataArg || !entry) { console.error("usage: node compare.mjs <app.holo> <data dir> <Module::dispatch> [sweep module]"); process.exit(2); }

const hex = (b) => Buffer.from(b).toString("hex");
const show = (b) => JSON.stringify(Buffer.from(b).toString("latin1")).slice(0, 90);

const app = await load(resolve(holoArg));
if (!app.identities?.verified) { console.error("the holo's identities did not verify"); process.exit(2); }
const data = resolve(dataArg);
const names = JSON.parse(readFileSync(join(data, "modules.json"), "utf8"));
const project = loadProject(Object.fromEntries(names.map((n) => [n, JSON.parse(readFileSync(join(data, ...n.split(".")) + ".json", "utf8"))])));
const interpret = (request) => { try { return project.call(entry, request); } catch (e) { return new TextEncoder().encode("<interpreter threw: " + e.message + ">"); } };

const report = { holo: { name: app.name, digest: (await app.inspect()).digest.sha256 }, entry, modules: names.length, missingPrimitives: project.missingPrimitives };
let differed = 0;
const differ = (kind, request, guest, mine) => { if (differed++ < 12) console.log(`DIFFER (${kind}) request ${show(request)}\n   guest       ${show(guest)}\n   interpreter ${show(mine)}`); };

// 1. The vectors the holo carries: the guest replays them itself, then the interpreter must give the recorded response.
const acceptance = await app.acceptance();
report.guestAcceptance = `${acceptance.passed} of ${acceptance.total}`;
let vectorAgree = 0;
for (const v of app.vectors) { const mine = interpret(v.request); if (hex(mine) === hex(v.response)) vectorAgree++; else differ("vector", v.request, v.response, mine); }
report.vectors = `${vectorAgree} of ${app.vectors.length}`;

// 2. Is this data form the model the holo was built from? Its own `application` must list the same vectors.
const module = entry.slice(0, entry.lastIndexOf("::"));
try {
  const declared = toArray(project.call(module + "::application").acceptanceVectors).map((v) => hex(v.request) + ">" + hex(v.response));
  const carried = app.vectors.map((v) => hex(v.request) + ">" + hex(v.response));
  report.sourceVectorsMatchHolo = declared.length === carried.length && declared.every((d, i) => d === carried[i]);
} catch (e) { report.sourceVectorsMatchHolo = "not checked: " + e.message; }

// 3. The sweep: requests no one wrote down. A request over the holo's limit is not sent.
const requests = new Map();
const add = (bytes) => { if (bytes.length <= app.limits.request) requests.set(hex(bytes), bytes); };
const enc = new TextEncoder();
for (const v of app.vectors) {
  const r = v.request; add(r);
  for (let i = 0; i <= r.length; i++) {
    add(Uint8Array.from([...r.slice(0, i), ...r.slice(i + 1)]));                         // one byte removed
    add(r.slice(0, i));                                                                  // truncated
    for (const b of [0x00, 0x09, 0x20, 0x2d, 0x30, 0x31, 0x39, 0x61, 0x7a, 0x80, 0xff]) {
      add(Uint8Array.from([...r.slice(0, i), b, ...r.slice(i)]));                        // one byte inserted
      if (i < r.length) { const c = Uint8Array.from(r); c[i] = b; add(c); }               // one byte replaced
    }
  }
}
if (sweepArg) for (const text of (await import(pathToFileURL(resolve(sweepArg)).href)).requests()) add(typeof text === "string" ? enc.encode(text) : text);

let agree = 0, t0 = performance.now(), guestMs = 0, mineMs = 0;
const answers = new Map();
for (const request of requests.values()) {
  let a = performance.now(); const guest = await app.dispatch(request); guestMs += performance.now() - a;
  a = performance.now(); const mine = interpret(request); mineMs += performance.now() - a;
  if (hex(guest) === hex(mine)) agree++; else differ("sweep", request, guest, mine);
  const key = show(guest); answers.set(key, (answers.get(key) ?? 0) + 1);
}
report.sweep = `${agree} of ${requests.size}`;
report.distinctAnswers = [...answers.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `${k} x${n}`);
report.msPerRequest = { guest: +(guestMs / requests.size).toFixed(4), interpreter: +(mineMs / requests.size).toFixed(4) };
report.seconds = +((performance.now() - t0) / 1000).toFixed(1);
report.differed = differed;
console.log(JSON.stringify(report, null, 1));
process.exit(differed ? 1 : 0);
