import { sameArchiveIdentity, admitPublication } from "./publication-identity.mjs";
import { requestBody, publicationDelay, checkCancellation, effectError } from "./publication-effects.mjs";
// Build an app with the Prism SDK on GitHub Actions, from the tab: what prism-code's buildFromTemplate does
// with gh and git (journey/engine.mjs, journey/github.mjs), done through api.github.com, which answers web
// pages. The repository is `<login>/prism-<name>`, public, made from UOR-Foundation/template; its pages and
// bootstrap workflows build the holo in the SDK image (Lean export, Rust, WebAssembly) and Lean checks every
// theorem in the gate; GitHub Pages then serves it. The holo is fetched back and checked here with
// prism-code's own code (prism-code/src/index.mjs, vendored byte for byte): every acceptance vector
// replayed in the built guest. Nothing is called published until that passes.
//
// `fetch`, `sleep` and `templateCommit` are passed in, so the same code runs in node against a real
// repository. `step(word, detail)` reports progress in words a person reads.
const API = "https://api.github.com";
export const TEMPLATE_REPOSITORY = "UOR-Foundation/template";
export const WORKFLOWS = ["pages.yml", "bootstrap.yml"];

export function gitHub(token, { fetch = globalThis.fetch, sleep, signal, timeoutMs = 30000 } = {}) {
  const call = async (method, path, body, accept = "application/vnd.github+json") => {
    const { response: r, body: text } = await requestBody(API + path, { method, headers: { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }, { fetch, signal, timeoutMs });
    if (!r.ok) {
      let already = false;
      try { already = /already/i.test(JSON.parse(text)?.message || ""); } catch {}
      throw Object.assign(effectError("httpRejected", `GitHub ${method} ${path}: ${r.status}${already ? " (already exists)" : ""}`), { status: r.status });
    }
    if (accept.endsWith(".raw")) return text;
    try { return text ? JSON.parse(text) : null; }
    catch { throw effectError("malformedResponse", "GitHub returned malformed JSON"); }
  };
  return { call, sleep: (ms) => publicationDelay(ms, { signal, sleep }), get: (p) => call("GET", p), post: (p, b) => call("POST", p, b), patch: (p, b) => call("PATCH", p, b), raw: (p) => call("GET", p, null, "application/vnd.github.raw") };
}

export const liveUrl = (repository) => { const [owner, repo] = repository.split("/"); return `https://${owner.toLowerCase()}.github.io/${repo}/`; };

// The repository: made from the template the first time, used again after that.
async function instance(gh, login, name, purpose, step) {
  const repository = `${login}/${name}`;
  let made = false;
  try { await gh.get(`/repos/${repository}`); }
  catch (e) {
    if (e.status !== 404) throw e;
    step("Creating the repository", `${repository}, public, from ${TEMPLATE_REPOSITORY}`);
    await gh.post(`/repos/${TEMPLATE_REPOSITORY}/generate`, { owner: login, name, description: purpose.slice(0, 300), include_all_branches: false, private: false });
    made = true;
  }
  // GitHub fills a repository from its template a moment after making it.
  let head = null;
  for (let i = 0; i < 60 && !head; i++) {
    try { head = (await gh.get(`/repos/${repository}/git/ref/heads/main`)).object.sha; } catch (e) { if (e.status !== 404 && e.status !== 409) throw e; await gh.sleep(2000); }
  }
  if (!head) throw effectError("timedOut", `${repository} was created but GitHub has not filled it from the template after two minutes; publish again shortly`);
  try { await gh.post(`/repos/${repository}/pages`, { build_type: "workflow" }); }
  catch (e) { if (e.status !== 409 && !/already/i.test(e.message)) throw Object.assign(new Error(`could not turn on GitHub Pages for ${repository}: ${e.message}`), { code: e.code, status: e.status }); }
  return { repository, head, made };
}

// One commit: the template commit prism-code makes, on top of main.
async function commitApp(gh, repository, head, { spec, axioms, attestation, templateCommit }) {
  const base = await gh.get(`/repos/${repository}/git/commits/${head}`);
  const listed = await gh.get(`/repos/${repository}/git/trees/${base.tree.sha}?recursive=1`);
  const tree = listed.tree.filter((e) => e.type === "blob").map((e) => e.path);
  const read = (path) => gh.raw(`/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${head}`);
  const { files, remove } = await templateCommit({ spec, axioms, attestation, repository, tree, read });
  const entries = [...files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })), ...remove.map((path) => ({ path, mode: "100644", type: "blob", sha: null }))];
  const made = await gh.post(`/repos/${repository}/git/trees`, { base_tree: base.tree.sha, tree: entries });
  if (made.sha === base.tree.sha) return { sha: head, changed: false, files: files.length };
  const commit = await gh.post(`/repos/${repository}/git/commits`, { message: `${spec.title}: the app, its claims and its page, from Prism AI Foundry`, tree: made.sha, parents: [head] });
  await gh.patch(`/repos/${repository}/git/refs/heads/main`, { sha: commit.sha });
  return { sha: commit.sha, changed: true, files: files.length, removed: remove.length };
}

// The template's two workflows on that commit, followed to the end, as prism-code's waitForWorkflows does.
async function waitForRuns(gh, repository, sha, step, { timeoutMs = 45 * 60 * 1000 } = {}) {
  const t0 = Date.now();
  const found = {};
  while (Object.keys(found).length < WORKFLOWS.length) {
    if (Date.now() - t0 > 4 * 60 * 1000) throw effectError("timedOut", `no run of ${WORKFLOWS.filter((w) => !found[w]).join(", ")} started for ${sha.slice(0, 12)} within four minutes`);
    const listed = await gh.get(`/repos/${repository}/actions/runs?head_sha=${sha}&per_page=50`);
    for (const w of WORKFLOWS) {
      const run = (listed.workflow_runs || []).filter((r) => String(r.path || "").endsWith(`/${w}`)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (run && !found[w]) found[w] = run;
    }
    if (Object.keys(found).length < WORKFLOWS.length) await gh.sleep(5000);
  }
  const ended = {};
  for (;;) {
    for (const w of WORKFLOWS) if (!ended[w]) { const r = await gh.get(`/repos/${repository}/actions/runs/${found[w].id}`); if (r.status === "completed") ended[w] = r; else found[w] = r; }
    const seconds = Math.round((Date.now() - t0) / 1000);
    step("Building with the Prism SDK", `${WORKFLOWS.map((w) => `${w.replace(".yml", "")} ${ended[w] ? ended[w].conclusion : found[w].status}`).join(", ")}, ${seconds} s`, { runs: Object.fromEntries(WORKFLOWS.map((w) => [w, (ended[w] || found[w]).html_url])) });
    if (WORKFLOWS.every((w) => ended[w])) return ended;
    if (Date.now() - t0 > timeoutMs) throw effectError("timedOut", `the build did not end in ${Math.round(timeoutMs / 60000)} minutes: ${found["pages.yml"].html_url}`);
    await gh.sleep(15000);
  }
}

// The live holo, once Pages serves this build of it: the page's app.json names the fingerprint it carries.
// Pages' edge caches for ten minutes, so each attempt asks with a query of its own; the holo is this
// build's when its fingerprint is the one its page names.
async function fetchLive(live, open, { fetch = globalThis.fetch, sleep, signal, timeoutMs, attempts = 48 }) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const v = "?v=" + Date.now();
      const page = await requestBody(new URL("app.json" + v, live), { cache: "no-store" }, { fetch, signal, timeoutMs });
      const holo = await requestBody(new URL("app.holo" + v, live), { cache: "no-store" }, { fetch, signal, timeoutMs, read: r => r.arrayBuffer() });
      if (page.response.ok && holo.response.ok) {
        const bytes = new Uint8Array(holo.body), json = JSON.parse(page.body);
        const app = await open(bytes);
        const named = json.attestations && json.attestations.build && json.attestations.build.id;
        last = { bytes, page: json, app, named };
        if (sameArchiveIdentity(named, app.identities?.archiveFingerprint)) return last;
      }
    } catch (error) { if (error?.code === "cancelled") throw error; }
    await sleep(5000);
  }
  if (last) return last;
  throw effectError("timedOut", `${live}app.holo did not answer within ${attempts} bounded retrieval attempts; the page may still be deploying`);
}

// The whole build. `checked(bytes)` opens the holo and replays its vectors (prism-code's loadArchive).
export async function buildOnGitHub({ token, spec, axioms = {}, attestation = null, templateCommit, open, step = () => {}, fetch = globalThis.fetch, sleep, signal, timeoutMs = 30000 }) {
  const gh = gitHub(token, { fetch, sleep, signal, timeoutMs });
  const t0 = Date.now();
  const me = await gh.get("/user");
  const name = `prism-${spec.name}`;
  const { repository, head } = await instance(gh, me.login, name, spec.purpose, step);
  step("Writing the app", `${repository}: the LexLean model and proofs, the claims, the tests and the page`);
  const commit = await commitApp(gh, repository, head, { spec, axioms, attestation, templateCommit });
  const runs = await waitForRuns(gh, repository, commit.sha, step);
  const failed = WORKFLOWS.filter((w) => runs[w].conclusion !== "success");
  if (failed.length) return { ok: false, repository, sha: commit.sha, runs, error: failed.map((w) => `${w} ended ${runs[w].conclusion}: ${runs[w].html_url}`).join("; ") };
  const live = liveUrl(repository);
  step("Checking the built app", `fetching ${live}app.holo and replaying every acceptance vector in its guest`);
  const fetched = await fetchLive(live, open, { fetch, sleep: gh.sleep, signal, timeoutMs });
  const app = fetched.app;
  checkCancellation(signal);
  const acceptance = await app.acceptance();
  checkCancellation(signal);
  const fingerprint = app.identities && app.identities.archiveFingerprint;
  // The pages workflow writes the fingerprint of the holo it built into app.json, as attestations.build.id.
  const pageSays = fetched.named;
  const admitted = admitPublication(pageSays, fingerprint, acceptance);
  return {
    ...admitted,
    repository, live, sha: commit.sha, runs, seconds: Math.round((Date.now() - t0) / 1000),
    holo: fetched.bytes, fingerprint, pageFingerprint: pageSays || null,
  };
}
