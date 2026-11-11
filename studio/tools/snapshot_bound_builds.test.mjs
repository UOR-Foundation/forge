import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { verifyCapturedSource, sameBuildSource, requiresRulePublication } from "../shell/build-source.mjs";
const source = { name: "Example", reference: "blake3:" + "a".repeat(64), files: [["b", "\ufeff\u00e9"], ["a", "exact\r\n"]], dependencies: [] };
const snapshot = () => ({ name: source.name, oid: source.reference, files: structuredClone(source.files) });
const host = fs.readFileSync(new URL("../shell/host.js", import.meta.url), "utf8");
test("verified source retains exact text and permits only ordering differences", () => {
  const target = snapshot(); target.files.reverse(); assert.equal(verifyCapturedSource(source, target), source);
  assert.equal(source.files[0][1], "\ufeff\u00e9");
});
test("reference name and file disagreement refuse", () => {
  for (const target of [{ ...snapshot(), oid: "other" }, { ...snapshot(), name: "Other" }, { ...snapshot(), files: [["a", "exact\n"], ["b", "\u00e9"]] }, { ...snapshot(), files: [] }]) assert.throws(() => verifyCapturedSource(source, target), e => e.code === "buildSourceMismatch");
});
test("dependency metadata must be an exact part of snapshot source", () => {
  const declared = ["prism/dependencies.json", JSON.stringify({ profile: "foundry/direct-dependency-requests/1", dependencies: [{ name: "react", version: "19.1.0" }] })];
  const captured = { ...source, files: [...source.files, declared], dependencies: ["react@19.1.0"] }, target = { ...snapshot(), files: captured.files };
  assert.equal(verifyCapturedSource(captured, target), captured);
  assert.throws(() => verifyCapturedSource({ ...captured, dependencies: [] }, target), e => e.code === "buildSourceMismatch");
  assert.throws(() => verifyCapturedSource({ ...source, dependencies: ["react@19.1.0"] }, snapshot()), e => e.code === "buildSourceMismatch");
});
test("malformed sources cannot pass the comparison or checker", () => {
  for (const bad of [null, {}, { ...source, files: null }, { ...source, files: [["a", 1]] }, { ...source, files: [["a", "1"], ["a", "2"]] }, { ...source, dependencies: null }]) {
    assert.equal(sameBuildSource(source, bad), false); assert.throws(() => verifyCapturedSource(bad, snapshot()), e => e.code === "buildSourceMismatch");
  }
  assert.equal(sameBuildSource(source, { ...source, files: [...source.files].reverse() }), true);
  for (const patch of [{ name: "x" }, { reference: "x" }, { files: [] }, { dependencies: ["changed"] }]) assert.equal(sameBuildSource(source, { ...source, ...patch }), false);
});
test("actual portable publication requires rule route even when proof cache is absent", async () => {
  const start = host.indexOf('handlers.set("holo:publish"'), end = host.indexOf("\nwindow.electron", start), handlers = new Map(); let audits = 0;
  const captured = { ...source, files: [...source.files, ["prism/spec.json", "invalid or unchecked"]] };
  vm.runInNewContext(host.slice(start, end), {
    handlers, coreReady: Promise.resolve(), performance: { now: () => 0 }, URL, BASE: "https://foundry.example/",
    core: { run: ({ op }) => op === "view" ? {} : { decision: "Accept" } },
    fetch: async () => ({ ok: true, json: async () => ({ closure: "closure", attestation_id: "receipt", browser_projection_sha256: "closure" }) }),
    verifiedBuildSource: async () => captured, requiresRulePublication, put: async () => audits++,
    rulesOf() { assert.fail("cached rules must not decide this route"); }, buildPortable() { assert.fail("rule publication bypassed"); },
  });
  const result = await handlers.get("holo:publish")({ appId: 1 }); assert.equal(result.decision, "Chat"); assert.equal(audits, 1);
});
test("both builders consume captured files and check source before promotion", () => {
  for (const [name, end] of [["buildPreview", "// ---- the live preview"], ["buildPortable", "// Runs inside the compile frame"]]) {
    const start = host.indexOf(`async function ${name}(`), body = host.slice(start, host.indexOf(end, start));
    assert.ok(body.includes("new Map(source.files)")); assert.ok(body.includes("source.dependencies"));
    assert.ok(body.includes("assertBuildSourceCurrent(await dbReady, appId, source)")); assert.ok(!body.includes("filesOf(appId)"));
  }
  assert.ok(host.includes("buildPortable(appId, captured)")); assert.ok(host.includes("assertBuildSourceCurrent(await dbReady, appId, captured)"));
  assert.ok(fs.readFileSync(new URL("./shell_parse.mjs", import.meta.url), "utf8").includes('"build-source.mjs": "mjs"'));
});
