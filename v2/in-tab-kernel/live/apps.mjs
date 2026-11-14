// Writes proofs for sample apps with live/emit.mjs, with no Lean, into a folder: one suffix per app.
//   node live/apps.mjs <library.ndjson> <VerdantRegions.lean> <out dir>
// parking         the studio's parking-fee example: 3 rules, 1 guarantee
// parking-false   the same rules with a guarantee they break; the kernel must refuse it
// parking-edited  the rules changed so that the true guarantee breaks; the kernel must refuse it
// verdant         Verdant, 35 rules and 15 guarantees, read from the Lean file the gate writes from its fixture
import fs from "node:fs";
import path from "node:path";
import { readLibrary, proofOf } from "./emit.mjs";

const [libraryPath, verdantPath, out] = process.argv.slice(2);
const text = fs.readFileSync(libraryPath, "utf8");
let t = performance.now();
const library = readLibrary(text);
const readMs = performance.now() - t;

const parking = {
  name: "ParkingTab", bounds: [[0, 24], [0, 2]], otherwise: 1,
  rules: [{ when: [[0, 4, 0]], outcome: 0 }, { when: [[1, 4, 2]], outcome: 2 }, { when: [[0, 2, 12]], outcome: 2 }],
  properties: [{ always: false, when: [[0, 4, 0]], outcome: 2 }],          // never premium when hours = 0
};
const apps = {
  parking,
  "parking-false": { ...parking, name: "ParkingFalse", properties: [{ always: false, when: [[1, 4, 2]], outcome: 2 }] },   // never premium for a truck: false
  "parking-edited": { ...parking, name: "ParkingEdited", rules: [{ when: [[1, 4, 2]], outcome: 2 }, ...parking.rules.filter((r) => r.outcome !== 2 || r.when[0][0] !== 1)] },   // the truck rule first: a truck at 0 hours is premium
  verdant: verdant(fs.readFileSync(verdantPath, "utf8")),
};

// The data of VerdantRegions.lean, read as written there.
function verdant(lean) {
  const block = (name) => { const m = new RegExp(`def ${name} : [^\\n]* := \\[([\\s\\S]*?)\\]\\n\\n`).exec(lean); if (!m) throw new Error("no " + name); return m[1]; };
  const conds = (s) => [...s.matchAll(/⟨(\d+), (\d+), (\d+)⟩/g)].map((m) => m.slice(1).map(Number));
  const rules = [...block("rules").matchAll(/⟨\[(.*?)\], (\d+)⟩/g)].map((m) => ({ when: conds(m[1]), outcome: Number(m[2]) }));
  const properties = [...block("props").matchAll(/⟨(true|false), \[(.*?)\], (\d+)⟩/g)].map((m) => ({ always: m[1] === "true", when: conds(m[2]), outcome: Number(m[3]) }));
  const bounds = [.../def B : Box := \[(.*)\]/.exec(lean)[1].matchAll(/\((\d+), (\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  return { name: "VerdantTab", bounds, rules, properties, otherwise: Number(/def d : Nat := (\d+)/.exec(lean)[1]) };
}

fs.mkdirSync(out, { recursive: true });
const report = { readLibraryMs: Math.round(readMs), apps: {} };
for (const [name, app] of Object.entries(apps)) {
  t = performance.now();
  const suffix = proofOf(text, app, library);
  const ms = performance.now() - t;
  fs.writeFileSync(path.join(out, name + ".ndjson"), suffix);
  report.apps[name] = { rules: app.rules.length, guarantees: app.properties.length, bytes: suffix.length, writeMs: Math.round(ms * 10) / 10 };
}
console.log(JSON.stringify(report, null, 1));
