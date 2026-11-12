// Assembles the v2 page: byte-for-byte copies of the files it serves, in the repository's own
// layout under v2/, so every relative import resolves unchanged, plus one generated file,
// site/apps.json, read from the specs themselves.
//
// Run: node v2/site/build.mjs <out dir>      (the page is then <out dir>/index.html)
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const v2 = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? "");
if (!process.argv[2]) { console.error("usage: node v2/site/build.mjs <out dir>"); process.exit(64); }

// What the page serves. Nothing else from the repository reaches the site.
const SERVED = [
  "shell/interp.mjs", "shell/render.mjs", "shell/app.html",
  "hosted-check/studio.html", "hosted-check/check.mjs", "hosted-check/library.json", "hosted-check/corpus/guests-2/App.lex.tex",
  "probe-payment/data", "probe-payment/src/Foundation", "loop/answers/guests-3.json",
  "loop/answers/guests-2.lex.tex", "loop/answers/guests-3.verified.lex.tex", "probe-payment/src/Payment.lex.tex",
  "site/index.html", "site/gallery.mjs",
];

rmSync(out, { recursive: true, force: true });
for (const path of SERVED) { mkdirSync(dirname(join(out, path)), { recursive: true }); cpSync(join(v2, path), join(out, path), { recursive: true }); }

// A theorem as the spec states it: its name, exact statement, proof form and axioms.
function theorems(source) {
  const found = [];
  for (const block of source.split(/\n(?=theorem\{)/).filter((b) => b.startsWith("theorem{"))) {
    const field = (name) => new RegExp(`\\n  ${name}: (.*?),?\\n(?=  [a-z_]+:|\\})`, "s").exec(block)?.[1]?.trim();
    found.push({ name: field("name"), statement: field("statement"), form: /proof:\s*([a-z_]+)/.exec(block)?.[1], axioms: (field("axioms") ?? "[]").replace(/[\[\]]/g, "").split(",").map((a) => a.trim()).filter(Boolean) });
  }
  return found;
}
// The plain sentences a spec promises: its `promises` definition, a list of string literals.
function promises(data) {
  const list = [];
  for (let node = data.declarations.find((d) => d.name === "promises")?.body; node?.kind === "cons"; node = node.tail) list.push(node.head.value);
  return list;
}

const declared = JSON.parse(readFileSync(join(v2, "site/apps.source.json"), "utf8"));
const apps = declared.apps.map((app) => {
  const source = readFileSync(join(v2, app.source), "utf8");
  const said = promises(JSON.parse(readFileSync(join(v2, app.modules[app.entry]), "utf8")));
  const proved = theorems(source).map((t, i) => {
    const sentence = said[i] ?? app.sentences?.[t.name];
    if (!sentence) throw new Error(`${app.id}: theorem ${t.name} has no sentence`);
    return { ...t, sentence, limit: app.limits?.[t.name] ?? null };
  });
  if (said.length && said.length !== proved.length) throw new Error(`${app.id}: ${said.length} promises but ${proved.length} theorems`);
  for (const name of Object.keys(app.limits ?? {})) if (!proved.some((t) => t.name === name)) throw new Error(`${app.id}: a limit names no theorem: ${name}`);
  return { id: app.id, title: app.title, origin: app.origin, sentence: app.sentence ?? null, entry: app.entry, source: app.source, modules: app.modules, attestation: app.attestation, tested: app.tested, proved, unproved: app.unproved ?? [] };
});
writeFileSync(join(out, "site/apps.json"), JSON.stringify({ library: "probe-payment/data", apps }, null, 1) + "\n");

// The address people open. A path with no dot in it is answered by Forge's own worker once that is
// installed, so every link on the site names a file.
writeFileSync(join(out, "index.html"), `<!doctype html>\n<meta charset="utf-8">\n<title>Prism AI Foundry v2</title>\n<meta http-equiv="refresh" content="0; url=site/index.html">\n<a href="site/index.html">Prism AI Foundry v2</a>\n`);

const size = (dir) => readdirSync(dir).reduce((n, f) => { const p = join(dir, f), s = statSync(p); return n + (s.isDirectory() ? size(p) : s.size); }, 0);
console.log(`v2 page: ${apps.length} apps, ${apps.reduce((n, a) => n + a.proved.length, 0)} theorems, ${size(out)} bytes in ${out}`);
