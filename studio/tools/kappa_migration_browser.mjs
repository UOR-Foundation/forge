// A device store written under BLAKE3 addresses (database version 2) moves to κ in one transaction:
// history, references and versions keep their shape; stale caches go; a failure changes nothing.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { chromium } from "../vendor/dyad/node_modules/playwright-core/index.mjs";
const sources = new Map([
  ["/migration.mjs", fs.readFileSync(new URL("../shell/kappa-migration.mjs", import.meta.url))],
  ["/address.mjs", fs.readFileSync(new URL("../shell/address.mjs", import.meta.url))],
  ["/prism-code/src/sha256.mjs", fs.readFileSync(new URL("../shell/prism-code/src/sha256.mjs", import.meta.url))],
]);
const server = http.createServer((request, response) => {
  if (request.url === "/") { response.setHeader("content-type", "text/html"); response.end("<!doctype html><title>κ migration acceptance</title>"); return; }
  const source = sources.get(request.url);
  response.statusCode = source ? 200 : 404;
  response.setHeader("content-type", "text/javascript"); response.end(source ?? "");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const executablePath = process.env.CHROME_BIN || ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(path => fs.existsSync(path));
const expected = { history: "re-addressed", main: "moved", versions: "moved", caches: "dropped", grants: "kept", failure: "unchanged" };
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const report = await page.evaluate(async () => {
    const { migrateDatabase, MIGRATION_KEY } = await import("/migration.mjs");
    const { kappa } = await import("/address.mjs");
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const enc = new TextEncoder(), dec = new TextDecoder();
    const legacy = (n) => "blake3:" + n.toString(16).padStart(64, "0");
    const spell = (project, parent) => JSON.stringify({ entries: project.entries.map((e) => [e.path, e.kappa, e.bytes]), name: project.label, parent });
    const open = (name) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => { for (const s of ["objects", "refs", "versions", "apps", "chats"]) request.result.createObjectStore(s); request.result.createObjectStore("seals", { keyPath: "id" }); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const seed = (db) => new Promise((resolve, reject) => {
      const t = db.transaction(["objects", "refs", "versions", "apps", "chats", "seals"], "readwrite");
      t.objectStore("objects").put(enc.encode("hello"), legacy(1));
      t.objectStore("objects").put(enc.encode(JSON.stringify({ entries: [["a.txt", legacy(1), 5]], name: "app", parent: "" })), legacy(2));
      t.objectStore("objects").put(enc.encode(JSON.stringify({ entries: [["a.txt", legacy(1), 5]], name: "app", parent: legacy(2) })), legacy(3));
      t.objectStore("refs").put(legacy(3), "1:main");
      t.objectStore("refs").put({ phase: "proved", specKappa: legacy(9) }, "prism:1");
      t.objectStore("refs").put({ serve: true, network: { endpoints: [], denied: [] } }, "capabilities:p1");
      t.objectStore("refs").put(true, MIGRATION_KEY);
      t.objectStore("versions").put([{ oid: legacy(3), message: "edit" }, { oid: legacy(2), message: "init" }], 1);
      t.objectStore("apps").put({ id: 1, name: "app", state: { phase: "checked", sourceKappa: legacy(9) } }, 1);
      t.objectStore("chats").put({ id: 1, appId: 1, messages: [{ commitHash: legacy(3) }] }, 1);
      t.objectStore("seals").put({ id: legacy(8), kind: "receipt" });
      t.oncomplete = resolve; t.onabort = () => reject(t.error);
    });
    const get = (db, store, key) => new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const count = (db, store) => new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).count(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

    const db = await open("kappa-migration");
    await seed(db);
    await migrateDatabase(db, { derive: kappa, spell });
    const main = await get(db, "refs", "1:main");
    check(/^sha256:[0-9a-f]{64}$/.test(main), "main is not a κ");
    const head = await get(db, "objects", main);
    check(kappa(head) === main, "head does not derive to its address");
    const snapshot = JSON.parse(dec.decode(head));
    check(snapshot.entries[0][1] === kappa(enc.encode("hello")), "file entry not re-addressed");
    const parent = await get(db, "objects", snapshot.parent);
    check(parent && JSON.parse(dec.decode(parent)).parent === "", "parent chain broken");
    check(await count(db, "objects") === 3, "objects not replaced one for one");
    const versions = await get(db, "versions", 1);
    check(versions[0].oid === main && versions[1].oid === snapshot.parent, "versions not moved");
    check((await get(db, "chats", 1)).messages[0].commitHash === main, "chat reference not moved");
    check(await get(db, "refs", "prism:1") === undefined && (await get(db, "apps", 1)).state === null && await count(db, "seals") === 0, "stale caches kept");
    check((await get(db, "refs", "capabilities:p1"))?.serve === true, "grant lost");
    check(await get(db, "refs", MIGRATION_KEY) === undefined, "marker kept");

    const failing = await open("kappa-migration-failure");
    await seed(failing);
    let refused = false;
    try { await migrateDatabase(failing, { derive: kappa, spell: () => { throw Error("core refused"); } }); } catch { refused = true; }
    check(refused, "a failing spell was not reported");
    check(await get(failing, "refs", "1:main") === legacy(3) && await get(failing, "refs", MIGRATION_KEY) === true && await count(failing, "seals") === 1, "a failed migration changed the store");
    return { history: "re-addressed", main: "moved", versions: "moved", caches: "dropped", grants: "kept", failure: "unchanged" };
  });
  assert.deepEqual(report, expected);
  console.log(JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
