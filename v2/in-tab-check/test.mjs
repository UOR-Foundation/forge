// node --test v2/in-tab-check/test.mjs
// Needs dist/lexlean-tab.wasm (bash v2/in-tab-check/build.sh). A missing checker fails these tests; none is skipped.
import nodeTest from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load, address, derive } from "./checker.mjs";
import { open, tree } from "./wasi.mjs";
import { createClient } from "./client.mjs";
import { describe, variants } from "./make-manifest.mjs";
import { compareAll, fromDisk as fromDiskOf, manifest as manifestOf, image, checkerBytes } from "./agree.mjs";
import { cases } from "../hosted-check/corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pack = readFileSync(join(here, "pack.json"));
const guests = cases().find((c) => c.id === "guests-2").spec;

// Every test runs on both checkers: the full build and the lean one.
for (const variant of variants) {
const wasm = checkerBytes(variant), manifest = () => manifestOf(variant);
const fromDisk = (options = {}) => fromDiskOf({ variant, ...options });
const checker = await fromDisk();
const test = (name, fn) => nodeTest(`${variant ? "lean" : "full"}: ${name}`, fn);

test("checker.json describes the built checker, the pack, the patch, the wrapper and the build script", () => {
  assert.deepEqual(describe(variant), manifest());
});

test("the lock it writes is byte for byte the lock the image wrote for the same project", () => {
  const c = cases().find((x) => x.id === "payment");
  assert.equal(checker.lock(c.spec, { extras: c.extras }), readFileSync(join(here, "..", "probe-payment", "lexlean.lock"), "utf8"));
});

test("the manifest's LexLean is the SDK image's, and the checker reports the same", () => {
  const said = image().version;
  assert.equal(manifest().image, image().image);
  // The image is the one the repository's SDK lock selects: when the SDK moves, this fails until the checker is rebuilt.
  assert.equal(manifest().image, readFileSync(join(here, "..", "..", "prismpm.lock"), "utf8").match(/"sdk_image":"([^"]+)"/)[1]);
  assert.equal(`lexlean ${checker.by.lexlean}`, said.split("\n")[0]);
  assert.equal(`compiler-semantics ${checker.by.semantics}`, said.split("\n")[2]);
});

test("the pack's library and lexicon are the files the image was run on", () => {
  const files = JSON.parse(pack).files;
  for (const line of image().library) {
    const [same, name] = line.split(" ");
    assert.equal(same, "same");
    if (name !== "prism.arch") assert.equal(files[`src/${name}`], readFileSync(join(here, "..", "probe-payment", "src", name), "utf8"));
  }
  assert.equal(Object.keys(files).filter((p) => p.startsWith("language/prism.arch/entries/")).length, 141);
});

test("the module imports the 25 file-system calls and nothing else", () => {
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(wasm));
  assert.ok(imports.every((i) => i.module === "wasi_snapshot_preview1" && i.kind === "function"));
  assert.ok(!imports.some((i) => /^sock_|^poll_/.test(i.name)), "no socket or poll call");
  assert.deepEqual(WebAssembly.Module.exports(new WebAssembly.Module(wasm)).filter((e) => e.kind === "function").map((e) => e.name).sort(), ["data", "run", "warm"]);
});

test("the library alone passes `check --all`, so naming only the author's modules leaves nothing unchecked", () => {
  const r = checker.library();
  assert.equal(r.success, true);
  assert.deepEqual(r.modules, image().library.filter((l) => l.endsWith(".lex.tex")).map((l) => l.split(" ")[1].replace(".lex.tex", "").split("/").join(".")).sort());
});

for (const scope of ["author", "all"]) test(`verdict, codes, messages, lines and columns equal the image's on every corpus file (scope ${scope})`, async () => {
  const rows = await compareAll(checker, scope);
  assert.equal(rows.length, 17);
  assert.deepEqual(Object.keys(image().cases).sort(), rows.map((r) => r.id).sort());
  for (const r of rows) {
    assert.ok(r.verdictAgrees, `${r.id}: image ${r.image}, tab ${r.tab}`);
    assert.ok(r.identical, `${r.id}: ${JSON.stringify(r.differences)}`);
  }
  assert.ok(rows.some((r) => r.image) && rows.some((r) => !r.image), "the corpus holds both verdicts");
});

test("a second checker gives the same bytes for every result: nothing depends on the instance or the clock", async () => {
  const other = await fromDisk();
  for (const c of cases()) {
    const a = await checker.check(c.spec, { extras: c.extras }), b = await other.check(c.spec, { extras: c.extras });
    assert.equal(b.cached, false);
    assert.equal(JSON.stringify({ ok: a.ok, d: a.diagnostics, data: a.data }), JSON.stringify({ ok: b.ok, d: b.diagnostics, data: b.data }), c.id);
  }
});

test("the data form is LexLean's and equals the one the hosted service gave for the same module", async () => {
  const c = cases().find((x) => x.id === "payment");
  const r = await checker.check(c.spec, { extras: c.extras });
  for (const name of ["Payment", "PaymentApproval"]) {
    const kept = JSON.parse(readFileSync(join(here, "..", "probe-payment", "data", `${name}.json`), "utf8"));
    assert.deepEqual(r.data[name], kept, name);
  }
  const kept = JSON.parse(readFileSync(join(here, "..", "probe-payment", "data", "Foundation", "Bytes.json"), "utf8"));
  assert.deepEqual(checker.libraryData("Foundation.Bytes"), kept);
});

test("bytes that are not the manifest's are refused before they run", async () => {
  const bad = Buffer.from(wasm);
  bad[bad.length - 1] ^= 1;
  await assert.rejects(load({ wasm: bad, pack, manifest: manifest() }), { code: "ITC_ADDRESS" });
  await assert.rejects(load({ wasm, pack: Buffer.concat([pack, Buffer.from(" ")]), manifest: manifest() }), { code: "ITC_ADDRESS" });
});

test("a checker that reports another LexLean is refused even when its address is the manifest's", async () => {
  const other = { ...manifest(), lexlean: { version: "0.4.0", semantics: manifest().lexlean.semantics } };
  await assert.rejects(load({ wasm, pack, manifest: other }), { code: "ITC_VERSION" });
  const semantics = { ...manifest(), lexlean: { version: manifest().lexlean.version, semantics: "0".repeat(64) } };
  await assert.rejects(load({ wasm, pack, manifest: semantics }), { code: "ITC_VERSION" });
});

test("a module that asks for a call the host does not give is refused by name", () => {
  // (module (import "env" "fetch" (func)))
  const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 2, 13, 1, 3, 101, 110, 118, 5, 102, 101, 116, 99, 104, 0, 0]);
  assert.throws(() => open(new WebAssembly.Module(bytes)), { code: "ITC_IMPORT" });
});

test("a result is reused only under the address of everything that made it, and a stored one is verified on read", async () => {
  const kept = new Map();
  const store = { get: async (k) => kept.get(k), put: async (k, v) => { kept.set(k, v); } };
  const first = await fromDisk({ store });
  const a = await first.check(guests);
  assert.equal(a.cached, false);
  assert.equal((await first.check(guests)).cached, "memory");
  const second = await fromDisk({ store });
  const b = await second.check(guests);
  assert.equal(b.cached, "store");
  assert.deepEqual(b.diagnostics, a.diagnostics);
  assert.equal((await second.check(guests + "\n")).cached, false, "one more byte is another address");
  // A stored verdict turned from refused to accepted does not hash to what was recorded, so it is not believed.
  const broken = cases().find((c) => c.id === "broken/wrong-type").spec;
  const third = await fromDisk({ store });
  const refused = await third.check(broken);
  assert.equal(refused.ok, false);
  const entry = JSON.parse(kept.get(refused.key));
  entry.value = JSON.stringify({ ok: true, exit: 0, diagnostics: [], data: {} });
  kept.set(refused.key, JSON.stringify(entry));
  const fourth = await fromDisk({ store });
  const again = await fourth.check(broken);
  assert.equal(again.cached, false);
  assert.equal(again.ok, false);
  // An entry filed under another key is not believed either.
  kept.set(a.key, kept.get(refused.key));
  assert.equal((await (await fromDisk({ store })).check(guests)).ok, true);
});

test("addresses are Hologram labels on the sha256 axis, and a derived address frames its parts", async () => {
  assert.equal(await address("abc"), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(await derive("d", ["ab", "c"]), await derive("d", ["a", "bc"]));
  assert.notEqual(await derive("d", ["ab"]), await derive("d", ["a", "b"]));
});

test("a trap ends the instance and the next check gets a new one", async () => {
  const instance = open(new WebAssembly.Module(wasm));
  // A descriptor the host never gave: the host answers with an error, LexLean reports it, nothing traps.
  const r = instance.call("run", { args: ["lexlean", "--project", "/absent/lexlean.toml", "--diagnostic-format", "json", "check", "--all"], root: tree({}) });
  assert.equal(JSON.parse(r.stdout).success, false);
  assert.equal(r.trap, null);
  assert.equal((await checker.check(guests)).ok, true);
});

test("the client answers in the tab when ready, through the hosted route while loading, and says which", async () => {
  const worker = () => {
    const w = { onmessage: null, postMessage: (m) => w.handle(m).catch((e) => w.onmessage({ data: { id: m.id, error: { code: e.code, message: e.message } } })), handle: async (m) => {
      if (m.type === "load") { w.checker = await load({ wasm: m.wasm, pack: m.pack, manifest: m.manifest }); w.onmessage({ data: { id: m.id, by: w.checker.by, loadMs: w.checker.loadMs } }); }
      else if (m.type === "warm") w.onmessage({ data: { id: m.id, ms: w.checker.warm() } });
      else w.onmessage({ data: { id: m.id, result: await w.checker.check(m.spec, { extras: m.extras }) } });
    } };
    return w;
  };
  const bytesOf = async (name) => (name === "checker" ? wasm : pack);
  let hostedCalls = 0;
  const hosted = async () => { hostedCalls++; return { ok: true, diagnostics: [] }; };
  const client = createClient({ makeWorker: worker, manifest: manifest(), bytesOf, hosted });
  const early = await client.check(guests);
  assert.equal(early.by.route, "hosted");
  assert.equal(early.by.instead.code, "ITC_NOT_LOADED");
  await client.start();
  const later = await client.check(guests);
  assert.equal(later.by.route, "in-tab");
  assert.equal(later.by.checker, manifest().checker);
  assert.equal(hostedCalls, 1);
  // With bytes that are not the manifest's the tab's checker never becomes ready, and the answer says so.
  const wrong = createClient({ makeWorker: worker, manifest: manifest(), bytesOf: async () => pack, hosted });
  await assert.rejects(wrong.start(), { code: "ITC_ADDRESS" });
  assert.equal((await wrong.check(guests)).by.instead.code, "ITC_ADDRESS");
  await assert.rejects(wrong.check(guests, { only: "in-tab" }), { code: "ITC_ADDRESS" });
});
}
