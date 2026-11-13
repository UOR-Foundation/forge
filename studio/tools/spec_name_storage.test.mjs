import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import * as prism from "../shell/prism.js";
import * as live from "../shell/live/project.mjs";
import * as lexlean from "../shell/live/lexlean.mjs";
import { readSpecFile } from "../shell/prism/spec-file.mjs";
import { retiredApplicationPaths, isStatefulModule } from "../shell/application-shape.mjs";

const host = fs.readFileSync(new URL("../shell/host.js", import.meta.url), "utf8");
const fixture = JSON.parse(prism.SPEC_EXAMPLE);
const checkedOf = raw => {
  const checked = prism.checkSpec(structuredClone(raw));
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  return checked;
};
const withoutName = () => { const raw = structuredClone(fixture); delete raw.name; return raw; };
const proofKey = spec => live.kappaOfValue({ name: spec.name, logic: live.logicOf(spec) });

// Execute the production host adapter, including its real checker and renderer.
// Only storage and lifecycle effects are controlled; no parallel name-normalization implementation.
async function apply(raw, { implementation = host, before = null } = {}) {
  const prior = lexlean.canonicalSource(fixture);
  const source = { reference: "captured", files: [
    ["prism/spec.json", JSON.stringify(fixture)],
    [`prism/${prior.name}.lex.tex`, prior.source],
    ["src/pages/Index.tsx", "import '@/lib/prism'"],
    ["notes.txt", "unrelated source"],
  ] };
  const start = implementation.indexOf("async function rulesAfterTurn(");
  const end = implementation.indexOf("// Lean proves", start);
  assert.ok(start >= 0 && end > start, "the production rules adapter must be present");
  let batch, options, commits = 0;
  const run = vm.runInNewContext(implementation.slice(start, end) + "\nrulesAfterTurn", {
    assertGenerationActive() {}, coreReady: Promise.resolve(), core: {}, dbReady: Promise.resolve({}),
    retiredApplicationPaths, appShape: { SOURCE_PATH: "prism/App.lex.tex", isAppShape: isStatefulModule },
    forgetApplicationFrames() {}, captureProjectSource: async () => source, prism, live, lexlean,
    rulesSnapshotOf: async () => ({ state: before, expected: before }), enc: new TextEncoder(),
    kappa: async bytes => live.kappaOfValue([...bytes]),
    nextPhase: async (phase, event) => event === "reword" ? phase : event === "check" ? "checked" : "drafting",
    now: () => "now", applyStoredProjectPatch: async (_db, id, patch, opts) => {
      assert.equal(id, 1); commits++; batch = patch; options = opts;
      return { changed: patch.writes.length + patch.deletes.length, source: { ...source, reference: "committed" } };
    },
  });
  const result = await run(1, `<dyad-spec>${JSON.stringify(raw).replaceAll("<", "\\u003c")}</dyad-spec>`);
  assert.equal(commits, 1, "one captured source transaction owns the specification and module");
  assert.equal(options.source, source);
  assert.equal(options.rulesUpdate.expected, before);
  assert.equal(result.source.reference, "committed");
  assert.ok(!batch.writes.some(({ path }) => path === "notes.txt" || path === "src/pages/Index.tsx"));
  assert.ok(!batch.deletes.some(({ path }) => path === "notes.txt"));
  const writes = new Map(batch.writes.map(({ path, content }) => [path, content]));
  return { stored: JSON.parse(writes.get("prism/spec.json")), state: options.rulesUpdate.state, writes, batch };
}

async function assertStored(raw, implementation = host) {
  const original = structuredClone(raw), checked = checkedOf(raw);
  const result = await apply(raw, { implementation });
  const canonical = lexlean.canonicalSource({ ...original, name: checked.spec.name });
  assert.equal(result.stored.name, checked.spec.name, "stored name must equal the checker's name");
  assert.deepEqual(result.stored, { ...original, name: checked.spec.name }, "only the name default may change");
  assert.equal(result.writes.get(`prism/${canonical.name}.lex.tex`), canonical.source, "the canonical module must be in the same batch");
  assert.equal(result.writes.get("src/lib/prism.ts"), checkedOf(result.stored).module, "the generated runtime must use the checked stored specification");
  assert.equal(result.state.phase, "checked");
  assert.equal(result.state.spec.name, checked.spec.name);
  assert.equal(result.state.proof, null);
  assert.equal(result.state.logicKappa, proofKey(checked.spec));
  assert.equal(result.state.specKappa, live.kappaOfValue([...new TextEncoder().encode(result.writes.get("prism/spec.json"))]));
  assert.equal(readSpecFile(original).specAddress, readSpecFile(result.stored).specAddress, "normalization must preserve the canonical spec address");
  assert.deepEqual(raw, original, "caller metadata must remain detached");
  if (canonical.name !== "ParkingFee") assert.ok(result.batch.deletes.some(({ path }) => path === "prism/ParkingFee.lex.tex"));
  return result;
}

test("an omitted name stores the checker-derived name and canonical module atomically", async () => {
  await assertStored(withoutName());
});

test("null false and zero names cannot overwrite the checker-derived stored name", async () => {
  for (const name of [null, false, 0]) await assertStored({ ...fixture, name });
});

test("an empty name uses the checker-derived module instead of App.lex.tex", async () => {
  const result = await assertStored({ ...fixture, name: "" });
  assert.equal(result.writes.has("prism/App.lex.tex"), false);
});

test("explicit valid names and unrelated authoring fields are preserved", async () => {
  const raw = { ...fixture, name: "explicit-fee", actors: ["Attendant"], limits: ["No refunds"], meanings: { free: "No charge" } };
  const result = await assertStored(raw);
  assert.deepEqual(result.stored, raw);
  assert.equal(result.writes.has("prism/ExplicitFee.lex.tex"), true);
});

test("invalid specifications are not normalized into checked rules", async () => {
  for (const raw of [{ ...fixture, name: null, outcomes: [] }, { ...fixture, name: "Invalid Name" }]) {
    assert.equal(prism.checkSpec(structuredClone(raw)).ok, false);
    const result = await apply(raw);
    assert.deepEqual(result.stored, raw);
    assert.equal(result.state.phase, "drafting");
    assert.equal(result.state.proof, null);
    assert.equal(result.writes.has("src/lib/prism.ts"), false);
  }
});

test("default-name normalization retains matching semantic proof and marks publication bytes stale", async () => {
  for (const raw of [withoutName(), ...[null, false, 0, ""].map(name => ({ ...fixture, name }))]) {
    const checked = checkedOf(raw), proof = { id: "fixture-proof" };
    const before = { phase: "published", spec: checked.spec, specKappa: "previous-source", logicKappa: proofKey(checked.spec), proof, publicationCurrent: true };
    const result = await apply(raw, { before });
    assert.equal(result.stored.name, checked.spec.name);
    assert.equal(result.state.phase, "published");
    assert.equal(result.state.proof, proof);
    assert.equal(result.state.publicationCurrent, false);
  }
});

function mutate(from, to) {
  assert.equal(host.split(from).length, 2, "the planted defect must change exactly one production statement");
  return host.replace(from, to);
}
const assignment = 'if (named.ok && typeof named.spec?.name === "string") tag.spec = { ...tag.spec, name: named.spec.name };';
const namingAssertion = error => error.code === "ERR_ASSERTION" && error.message.includes("stored name must equal the checker's name");

test("negative control rejects omitted host name normalization", async () => {
  const broken = mutate(assignment, "void named;");
  await assert.rejects(assertStored(withoutName(), broken), namingAssertion);
});

test("negative control rejects a raw name overwriting the normalized name", async () => {
  const broken = mutate(assignment, 'if (named.ok && typeof named.spec?.name === "string") tag.spec = { name: named.spec.name, ...tag.spec };');
  for (const name of [null, false, 0]) await assert.rejects(assertStored({ ...fixture, name }, broken), namingAssertion);
});

test("negative control rejects bypassing normalization for an empty string", async () => {
  const broken = mutate('(typeof tag.spec.name !== "string" || !tag.spec.name)', 'typeof tag.spec.name !== "string"');
  await assert.rejects(assertStored({ ...fixture, name: "" }, broken), namingAssertion);
});
