// node --test v2/hosted-check/test.mjs
// The agreement test calls the hosted service and fails, never skips, when it cannot reach it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepare, mapDiagnostic, retitle, SUBSTITUTE } from "./check.mjs";
import { cases } from "./corpus.mjs";
import { compareAll, libraryFromDisk } from "./agree.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const library = await libraryFromDisk();
const image = JSON.parse(readFileSync(join(here, "image-results.json"), "utf8"));
const outsideTitle = (s) => s.replace(/^\\title\{[^}\n]*\}$/m, "\\title{}");

test("only title text changes, and every line keeps its number", () => {
  for (const c of cases()) {
    const p = prepare(c.spec, { library, extras: c.extras });
    for (const f of p.files) {
      const name = f.content.match(/^\\begin\{lexlean\}\{([^}]+)\}/)[1];
      const original = library.modules[name] ?? [c.spec, ...c.extras].find((s) => s.startsWith(`\\begin{lexlean}{${name}}`));
      assert.equal(outsideTitle(f.content), outsideTitle(original), `${c.id} ${f.path}`);
      assert.equal(f.content.split("\n").length, original.split("\n").length);
    }
  }
});

test("every SDK title phrase the hosted lexicon lacks is replaced, and none it holds", () => {
  const lib = prepare(cases().find((c) => c.id === "guests-2").spec, { library });
  const model = lib.files.find((f) => f.path === "src/Foundation/View/Browser/V1/Model.lex.tex");
  assert.match(model.content, /^\\title\{Text application model\}$/m);
  assert.equal(retitle("\\title{Bounded byte buffer}\n", library.titles).edits.length, 0);
  assert.equal(retitle("\\title{Browser view model Bounded byte buffer}\n", library.titles).content, `\\title{${SUBSTITUTE} Bounded byte buffer}\n`);
  // A phrase is replaced only as whole words.
  assert.equal(retitle("\\title{Browser view models}\n", library.titles).edits.length, 0);
  assert.equal(library.titles.length, 141);
});

test("a position after a replaced phrase maps back to the text as written", () => {
  const spec = cases().find((c) => c.id === "broken/title-phrase-then-unknown").spec;
  const p = prepare(spec, { library });
  const sent = p.files.find((f) => f.path === "src/App.lex.tex").content;
  const line = sent.split("\n")[5], col = line.indexOf("Guest") + 1, byte = Buffer.byteLength(sent.slice(0, sent.indexOf("Guest")));
  const d = mapDiagnostic({ code: "LLL1004", message: "", primary: { path: "src/App.lex.tex", line_start: 6, line_end: 6, column_start: col, column_end: col + 5, byte_start: byte, byte_end: byte + 5 } }, p);
  assert.equal(d.column, spec.split("\n")[5].indexOf("Guest") + 1);
  assert.equal(spec.slice(d.byteStart, d.byteEnd), "Guest");
  assert.equal(d.origin, "author");
  // A position inside a replaced phrase points into the phrase as written; one before it does not move.
  const inside = mapDiagnostic({ primary: { path: "src/App.lex.tex", line_start: 6, column_start: 8 + SUBSTITUTE.length - 1 } }, p);
  assert.ok(inside.column >= 8 && inside.column <= 8 + "Browser view model".length);
  assert.equal(mapDiagnostic({ primary: { path: "src/App.lex.tex", line_start: 6, column_start: 3 } }, p).column, 3);
  assert.equal(mapDiagnostic({ primary: { path: "src/App.lex.tex", line_start: 23, column_start: 1 } }, p).column, 1);
});

test("the image result file is complete and was made from the same library", () => {
  assert.deepEqual(Object.keys(image.cases).sort(), cases().map((c) => c.id).sort());
  assert.ok(image.library.every((l) => l.startsWith("same ")), image.library.join("; "));
  assert.equal(image.image, library.image);
  assert.ok(Object.values(image.cases).some((c) => c.ok) && Object.values(image.cases).some((c) => !c.ok));
});

test("the hosted route agrees with the SDK image on every corpus file", { timeout: 180000 }, async () => {
  const rows = await compareAll();
  assert.equal(rows.length, cases().length);
  for (const r of rows) {
    assert.ok(r.verdictAgrees, `${r.id}: image ${r.image}, hosted ${r.hosted}`);
    assert.ok(r.identical, `${r.id}: ${JSON.stringify(r.differences)}`);
  }
});
