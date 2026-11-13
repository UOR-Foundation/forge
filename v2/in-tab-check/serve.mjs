// Development only: a static server for v2/ that sends the headers a static host or the service worker would.
// The worker's own response carries a policy with no connection allowed, so the checker cannot reach a network.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".tex": "text/plain; charset=utf-8" };
const port = Number(process.env.PORT || 4231);
const zipped = new Map();

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(root, path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end(); }
  try {
    let body = await readFile(file);
    const headers = { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store", "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" };
    if (path.endsWith("/in-tab-check/worker.mjs")) headers["content-security-policy"] = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'";
    if (/\bgzip\b/.test(req.headers["accept-encoding"] ?? "") && /\.(wasm|json|mjs)$/.test(file)) {
      if (!zipped.has(file)) zipped.set(file, gzipSync(body, { level: 9 }));
      body = zipped.get(file);
      headers["content-encoding"] = "gzip";
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/in-tab-check/bench.html`));
