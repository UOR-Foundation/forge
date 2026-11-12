// Run: node --test v2/site/test.mjs
// Builds the v2 page into a temporary folder and holds the result to what the page claims.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), "v2-site-"));
execFileSync(process.execPath, [join(here, "build.mjs"), out], { stdio: "pipe" });
process.on("exit", () => rmSync(out, { recursive: true, force: true }));

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const site = JSON.parse(readFileSync(join(out, "site/apps.json"), "utf8"));
const { loadProject, toArray } = await import(pathToFileURL(join(out, "shell/interp.mjs")).href);
const data = (path) => JSON.parse(readFileSync(join(out, path), "utf8"));
const library = Object.fromEntries(data(site.library + "/modules.json").filter((n) => n.startsWith("Foundation.")).map((n) => [n, data(`${site.library}/${n.split(".").join("/")}.json`)]));

test("every app on the page runs from the built files and its first frame is one the protocol admits", () => {
  assert.ok(site.apps.length >= 2);
  for (const app of site.apps) {
    const project = loadProject({ ...library, ...Object.fromEntries(Object.entries(app.modules).map(([name, path]) => [name, data(path)])) });
    const frame = project.call(app.entry + "::view", project.call(app.entry + "::initial"));
    assert.equal(project.call("Foundation.View.Browser.V1.Model::presentationValid", frame), true, app.id);
    assert.ok(toArray(project.call(app.entry + "::catalogue")).length > 0, app.id);
    assert.deepEqual(project.missingPrimitives, [], app.id);
  }
});

test("every promise shown stands beside a theorem the served spec really states", () => {
  for (const app of site.apps) {
    const source = readFileSync(join(out, app.source), "utf8");
    assert.match(app.attestation, /^[0-9a-f]{64}$/, app.id);
    assert.ok(app.proved.length > 0, app.id);
    for (const t of app.proved) {
      assert.ok(t.sentence && t.sentence.length > 10, `${app.id}.${t.name} has a sentence`);
      assert.ok(source.includes(`name: ${t.name},`) && source.includes(`statement: ${t.statement}`), `${app.id}.${t.name} is in the spec as shown`);
      assert.ok(["reflexivity", "linear_arithmetic", "decide"].includes(t.form), t.form);
    }
  }
});

test("a promise whose theorem proves less than its sentence says so", () => {
  const guests = site.apps.find((a) => a.id === "guests");
  const limited = guests.proved.filter((t) => t.limit).map((t) => t.name);
  assert.deepEqual(limited, ["emptyIgnored", "longIgnored", "staleIgnored"]);
  for (const t of guests.proved.filter((t) => /changes nothing|never changes anything/.test(t.sentence))) assert.ok(t.limit, `${t.name} claims the whole state and must carry its limit`);
  assert.ok(guests.unproved.length >= 3);
});

test("the studio finds every library source it sends for checking, and its starting spec", () => {
  const lib = data("hosted-check/library.json");
  for (const path of Object.values(lib.modules)) assert.ok(existsSync(resolve(out, "hosted-check", path)), path);
  assert.ok(existsSync(join(out, "hosted-check/corpus/guests-2/App.lex.tex")));
});

test("every link and import on the page names a file that is served", () => {
  for (const page of ["index.html", "site/index.html", "hosted-check/studio.html", "shell/app.html"]) {
    const html = readFileSync(join(out, page), "utf8");
    const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g), ...html.matchAll(/url=([^"]+)"/g), ...html.matchAll(/from "(\.[^"]+)"/g)].map((m) => m[1]).filter((r) => !/^https?:/.test(r));
    for (const ref of refs) {
      assert.ok(/\.[a-z]+$/.test(ref), `${page}: ${ref} must name a file, because a path with no dot is answered by Forge's worker`);
      assert.ok(existsSync(resolve(out, dirname(page), ref)), `${page}: ${ref}`);
    }
  }
});

test("the page's code stays inside the first-load budget of 60 KB gzip", () => {
  const first = ["shell/interp.mjs", "shell/render.mjs", "site/gallery.mjs", "site/index.html"];
  const bytes = gzipSync(Buffer.concat(first.map((f) => readFileSync(join(out, f)))), { level: 9 }).length;
  assert.ok(bytes <= 60 * 1024, `${bytes} bytes gzip`);
  const studio = gzipSync(Buffer.concat(["shell/interp.mjs", "shell/render.mjs", "hosted-check/check.mjs", "hosted-check/studio.html"].map((f) => readFileSync(join(out, f)))), { level: 9 }).length;
  assert.ok(studio <= 60 * 1024, `${studio} bytes gzip`);
});

test("nothing but the listed files reaches the site", () => {
  const files = walk(out).map((p) => p.slice(out.length + 1).split("\\").join("/"));
  assert.ok(files.length < 60, `${files.length} files`);
  for (const f of files) assert.ok(/^(index\.html|site\/|shell\/(interp|render)\.mjs|shell\/app\.html|hosted-check\/(studio\.html|check\.mjs|library\.json|corpus\/guests-2\/App\.lex\.tex)|probe-payment\/(data|src)\/|loop\/answers\/guests-(2\.lex\.tex|3\.json|3\.verified\.lex\.tex))/.test(f), f);
  assert.ok(!files.some((f) => /node_modules|\.log$|prismpm\.lock|\.lexlean/.test(f)));
});
