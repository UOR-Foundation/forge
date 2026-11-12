// Development only: this branch's shell sources over the deployed site, served under /foundry/ as
// Pages serves it. A file that exists in studio/shell is served from here; anything else (the built
// renderer, the core, the worker, the models' manifests) is fetched once from the deployed site and
// kept in a cache folder. It lets a change to the shell be tried in the real app without the lane.
//
//   node tools/overlay_serve.mjs [port] [cache dir]        PORT in the environment also sets the port
//
// What it cannot show: anything the lane derives from the shell's bytes (the worker's closure hashes,
// the page projected by the core). The deployed copies of those describe the deployed shell.
//
//   node tools/overlay_serve.mjs --closure [--checker-fault] ...     (or CLOSURE=1, CHECKER_FAULT=1)
//
// With --closure the worker is this branch's too: sw.js is shell/sw.template.js with a closure digest
// written in, and manifest.json lists what this server answers (the deployed list, with this branch's
// bytes for every file the branch holds), as the projector would for a shell made of those files. It
// also answers checker/sha256-<hex>.wasm with the in-tab checker from v2/in-tab-check/dist/ (built, not
// committed), so the checker in the tab can be tried through the worker that serves it. --checker-fault
// answers that address with one byte changed, the defect the page must refuse.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shell = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shell");
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--"))), args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const port = Number(process.env.PORT || args[0] || 4190);
const cache = path.resolve(args[1] || path.join(os.tmpdir(), "foundry-overlay-cache"));
const CLOSURE = process.env.CLOSURE === "1" || flags.has("--closure"), CHECKER_FAULT = process.env.CHECKER_FAULT === "1" || flags.has("--checker-fault");
const SITE = "https://uor-foundation.github.io/foundry/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };
const type = (file) => TYPES[path.extname(file)] || "application/octet-stream";
const inside = (root, file) => file === root || file.startsWith(root + path.sep);

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const UNLISTED = new Set(["manifest.json", "provenance.json", "warmup.json", "sw.js", "sw.template.js", "404.html"]);
function branchFiles(dir = shell, rel = "", out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const name = rel + entry.name;
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) { if (rel === "" && ["app", "assets", "scaffold", "checker"].includes(entry.name)) continue; branchFiles(path.join(dir, entry.name), name + "/", out); }
    else if (!UNLISTED.has(name)) out.push(name);
  }
  return out;
}
let closureOnce = null;
const closure = () => (closureOnce ??= (async () => {
  const rows = new Map(JSON.parse((await deployed("manifest.json")).body.toString("utf8")).files.map((f) => [f.path, f]));
  for (const name of branchFiles()) { const bytes = fs.readFileSync(path.join(shell, name)); rows.set(name, { path: name, sha256: sha256(bytes), bytes: bytes.length }); }
  const files = [...rows.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
  const digest = sha256(JSON.stringify(files));
  return { manifest: JSON.stringify({ spec: "hologram-forge/shell/1", closure: digest, files }) + "\n", worker: fs.readFileSync(path.join(shell, "sw.template.js"), "utf8").replace("__CLOSURE__", digest) };
})());
function checkerBytes(rel) {
  const manifest = JSON.parse(fs.readFileSync(path.join(shell, "live/v2/in-tab/checker-lean.json"), "utf8"));
  if (rel !== "checker/" + manifest.checker.replace(":", "-") + ".wasm") return null;
  const bytes = fs.readFileSync(path.resolve(shell, "../../v2/in-tab-check/dist/lexlean-tab-lean.wasm"));
  if (CHECKER_FAULT) bytes[bytes.length - 1] ^= 1;
  return bytes;
}

async function deployed(rel) {
  const file = path.join(cache, rel || "index.html");
  if (!inside(cache, file)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return { body: fs.readFileSync(file), status: 200 };
  const res = await fetch(SITE + rel);
  const body = Buffer.from(await res.arrayBuffer());
  if (res.status === 200) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); }
  return { body, status: res.status };
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (!url.pathname.startsWith("/foundry/")) { res.writeHead(302, { location: "/foundry/" }); return res.end(); }
    let rel = decodeURIComponent(url.pathname.slice("/foundry/".length));
    const local = path.join(shell, rel);
    const headers = { "cache-control": "no-store", "service-worker-allowed": "/foundry/" };
    if (CLOSURE) {
      if (rel === "manifest.json" || rel === "sw.js") { const c = await closure(); res.writeHead(200, { ...headers, "content-type": type(rel), "x-overlay": "branch closure" }); return res.end(rel === "sw.js" ? c.worker : c.manifest); }
      if (rel.startsWith("checker/")) { const bytes = checkerBytes(rel); res.writeHead(bytes ? 200 : 404, { ...headers, "content-type": "application/wasm", "x-overlay": "branch checker" }); return res.end(bytes || ""); }
    }
    if (rel && inside(shell, local) && fs.existsSync(local) && fs.statSync(local).isFile()) { res.writeHead(200, { ...headers, "content-type": type(local), "x-overlay": "branch" }); return res.end(fs.readFileSync(local)); }
    // Pages answers a path it does not have with 404.html, which is the app's one page.
    const page = !path.extname(rel);
    const got = await deployed(page ? (rel === "" ? "index.html" : "404.html") : rel);
    if (!got) { res.writeHead(403); return res.end(); }
    res.writeHead(page && rel !== "" ? 404 : got.status, { ...headers, "content-type": page ? TYPES[".html"] : type(rel), "x-overlay": "deployed" });
    res.end(got.body);
  } catch (e) { res.writeHead(502, { "content-type": "text/plain" }); res.end(String(e && e.message || e)); }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/foundry/  (shell: ${shell}; deployed files cached in ${cache})`));
