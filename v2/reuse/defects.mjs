// Run: node v2/reuse/defects.mjs
// Plants one defect per mechanism in the bytes the adapters actually run (the model's data form,
// or an adapter file), runs the test suite, requires it to fail, then restores the file byte for
// byte and requires the suite to pass again. Prints one JSON line per defect.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const runTests = () => {
  const r = spawnSync(process.execPath, ["--test", here("./test.mjs")], { encoding: "utf8" });
  const count = (k) => Number((r.stdout.match(new RegExp(`^# ${k} (\\d+)`, "m")) ?? [0, -1])[1]);
  return { exit: r.status, pass: count("pass"), fail: count("fail"), failing: [...r.stdout.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]) };
};
const editJson = (file, name, mutate) => (text) => {
  const data = JSON.parse(text);
  mutate(data.declarations.find((d) => d.name === name).body);
  return JSON.stringify(data) + "\n";
};

const DEFECTS = [
  {
    mechanism: "1 address", file: "./data/Address.json",
    defect: "stalenessCode compares previous.dependencies with itself, so a changed dependency is not seen",
    plant: editJson("Address", "stalenessCode", (b) => { b.else_value.else_value.condition.value.right.value.name = "previous"; }),
  },
  {
    mechanism: "2 proof cache", file: "./data/ProofCache.json",
    defect: "admissionCode compares the query's toolchain with itself, so a record from another toolchain is admitted",
    plant: editJson("ProofCache", "admissionCode", (b) => { const r = b.else_value.condition.value.right; r.value.name = "query"; }),
  },
  {
    mechanism: "3 store", file: "./adapter/store.mjs",
    defect: "get trusts the stored bytes: the derived address is taken to be the expected one (Hologram's local read)",
    plant: (text) => { const out = text.replace("const derived = blobAddress(bytes);", "const derived = expected;"); if (out === text) throw new Error("anchor not found"); return out; },
  },
  {
    mechanism: "4 compute ahead", file: "./data/Ahead.json",
    defect: "lookupCode checks the app but not the state, so a table answers for another state",
    plant: editJson("Ahead", "lookupCode", (b) => { b.condition = b.condition.left; }),
  },
];

const baseline = runTests();
if (baseline.fail !== 0 || baseline.exit !== 0) { console.error("baseline is not green", baseline); process.exit(1); }
let ok = true;
for (const d of DEFECTS) {
  const path = here(d.file), original = readFileSync(path);
  let planted, restored;
  try {
    writeFileSync(path, d.plant(original.toString("utf8")));
    planted = runTests();
  } finally {
    writeFileSync(path, original);
  }
  restored = runTests();
  const intact = sha(readFileSync(path)) === sha(original);
  const caught = planted.exit !== 0 && planted.fail > 0;
  ok &&= caught && intact && restored.fail === 0;
  console.log(JSON.stringify({ mechanism: d.mechanism, defect: d.defect, planted: { exit: planted.exit, pass: planted.pass, fail: planted.fail, failing: planted.failing }, restored: { exit: restored.exit, pass: restored.pass, fail: restored.fail }, restoredByteForByte: intact }));
}
process.exit(ok ? 0 : 1);
