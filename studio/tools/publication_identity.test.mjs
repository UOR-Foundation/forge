import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { admitPublication, sameArchiveIdentity } from "../shell/publication-identity.mjs";
const digest = "0123456789abcdef".repeat(4);
const accepted = { total: 2, passed: 2, failed: [] };
const url = new URL("../shell/github-build.js", import.meta.url);
const source = fs.readFileSync(url, "utf8").replace(/from "(\.\/[^\"]+)"/g, (_, path) => `from ${JSON.stringify(new URL(path, url).href)}`);
const { buildOnGitHub } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

test("canonical exact identity produces a typed body-fingerprint receipt", () => {
  assert.deepEqual(admitPublication(digest, digest, accepted), {
    ok: true, identity: { kind: "archiveFingerprint", algorithm: "blake3", profile: "holo-v4-body", version: 1, digest }, vectors: { passed: 2, total: 2 },
  });
});
test("suffixes, algorithms, coercions and malformed digests cannot establish identity", () => {
  for (const malformed of [undefined, null, "", digest.slice(1), digest + "a", "blake3:" + digest, "sha256:" + digest, "prefix" + digest, digest.toUpperCase(), digest + "\n", { toString: () => digest }]) {
    assert.equal(sameArchiveIdentity(malformed, digest), false);
    assert.equal(sameArchiveIdentity(digest, malformed), false);
    assert.equal(admitPublication(malformed, digest, accepted).code, "invalidArchiveIdentity");
  }
});
test("different complete digests report mismatch", () => {
  assert.equal(admitPublication("a".repeat(64), digest, accepted).code, "archiveIdentityMismatch");
});
test("empty or inconsistent runtime reports cannot establish acceptance", () => {
  for (const report of [undefined, null, {}, { total: 0, passed: 0, failed: [] }, { total: 2, passed: 1, failed: [] }, { total: 1, passed: 2, failed: [] }, { total: -1, passed: -1, failed: [] }, { total: 1.5, passed: 1.5, failed: [] }, { total: "2", passed: 2, failed: [] }, { total: 1, passed: 1, failed: null }, { total: Infinity, passed: Infinity, failed: [] }]) {
    assert.equal(admitPublication(digest, digest, report).code, "invalidAcceptance");
  }
});
test("a complete report with a failed vector refuses", () => {
  assert.equal(admitPublication(digest, digest, { total: 2, passed: 1, failed: [{ index: 1 }] }).code, "acceptanceFailed");
});

async function build(named, fingerprint, acceptance) {
  const reply = value => new Response(JSON.stringify(value));
  const fetch = async (value) => {
    const url = new URL(value);
    if (url.hostname !== "api.github.com") {
      return url.pathname.endsWith("app.json") ? reply({ attestations: { build: { id: named } } }) : new Response(new Uint8Array([1, 2, 3]));
    }
    if (url.pathname === "/user") return reply({ login: "user" });
    if (url.pathname.endsWith("/git/ref/heads/main")) return reply({ object: { sha: "head" } });
    if (url.pathname.endsWith("/git/commits/head")) return reply({ tree: { sha: "tree" } });
    if (url.pathname.endsWith("/git/trees/tree")) return reply({ tree: [] });
    if (url.pathname.endsWith("/git/trees")) return reply({ sha: "tree" });
    if (url.pathname.endsWith("/actions/runs")) return reply({ workflow_runs: ["pages.yml", "bootstrap.yml"].map((w, id) => ({ id, path: ".github/workflows/" + w, created_at: "2026-01-01T00:00:00Z" })) });
    if (/\/actions\/runs\/\d$/.test(url.pathname)) return reply({ status: "completed", conclusion: "success" });
    return reply({});
  };
  return buildOnGitHub({ token: "token", spec: { name: "test", purpose: "test" }, fetch, sleep: async () => {}, templateCommit: async () => ({ files: [], remove: [] }), open: async () => ({ identities: { archiveFingerprint: fingerprint }, acceptance: async () => acceptance }) });
}
test("the actual build returns a typed receipt for matching live identity and runtime evidence", async () => {
  const result = await build(digest, digest, accepted);
  assert.equal(result.ok, true); assert.equal(result.identity.digest, digest); assert.deepEqual(result.vectors, { passed: 2, total: 2 });
});
test("the actual build refuses algorithm-prefix spoofing and a stale page", async () => {
  assert.equal((await build("sha256:" + digest, digest, accepted)).code, "invalidArchiveIdentity");
  assert.equal((await build("a".repeat(64), digest, accepted)).code, "archiveIdentityMismatch");
});
test("the actual build refuses missing identity and vacuous runtime acceptance", async () => {
  assert.equal((await build(undefined, undefined, accepted)).code, "invalidArchiveIdentity");
  assert.equal((await build(digest, digest, { total: 0, passed: 0, failed: [] })).code, "invalidAcceptance");
});
