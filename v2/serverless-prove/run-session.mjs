// Development: the session as the worker runs it, in Node.   node run-session.mjs
import { readFileSync } from "node:fs";
import { Session } from "./tab.mjs";
const d = (p) => readFileSync(new URL("./dist/" + p, import.meta.url));
const manifest = JSON.parse(d("manifest.json")), records = JSON.parse(d("records.json"));
const spec = (name, override) => {
  const src = JSON.parse(readFileSync(new URL(`./corpus/${name}/data/source.json`, import.meta.url)));
  const modules = Object.fromEntries(src.modules.map((m) => [m, JSON.parse(readFileSync(new URL(`./corpus/${name}/data/${m}.json`, import.meta.url)))]));
  if (override) modules.App = override;
  return { prefix: "PrismTextRequest", modules };
};
let t = performance.now();
const s = await Session.open({ manifest, wasm: d("kernel-tab.wasm"), library: d("library.ndjson") });
console.log("ready", (performance.now() - t).toFixed(0), "ms", JSON.stringify(s.timing));
for (const name of ["guests", "payment"]) {
  const sp = spec(name), mine = records.filter((r) => r.suffix.startsWith(name));
  t = performance.now();
  const a = await s.admitSuffix(mine[0], d(mine[0].suffix));
  console.log(name, "admit", (performance.now() - t).toFixed(0), "ms", a.refusal ?? "");
  const theorems = mine.map((r) => r.theorem);
  for (let i = 0; i < 2; i++) {
    const j = s.judge(sp, theorems, mine[0].bundle);
    console.log(name, "whole", j.ms.toFixed(0), "ms (assemble", j.assembleMs.toFixed(0), "kernel", j.kernelMs.toFixed(0) + ")", j.rows.map((r) => r.verdict).join(","));
  }
}
const g = records.find((r) => r.theorem.endsWith("startsEmpty"));
for (const tag of ["edit-true", "edit-false"]) {
  const sp = spec("guests", JSON.parse(d(`guests.App.${tag}.json`)));
  t = performance.now();
  const key = await s.key(sp, g.theorem);
  const j = s.judge(sp, [g.theorem], g.bundle, { explain: tag === "edit-false" });
  console.log(tag, "key", key.slice(7, 19), "changed:", key !== g.key, "verdict", j.rows[0].verdict, (performance.now() - t).toFixed(0), "ms", j.failing ?? "");
}
