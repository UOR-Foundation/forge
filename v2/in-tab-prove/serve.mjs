// Development only: a static server for this directory. It deliberately sends no cross-origin isolation headers
// (no COOP, no COEP): the check must work on a plain static host. The worker's script carries a policy that allows
// no connection at all.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".ndjson": "application/x-ndjson" };
const port = Number(process.env.PORT ?? 4391);
const zipped = new Map();

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(root, path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end(); }
  try {
    let body = await readFile(file);
    const headers = { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" };
    if (path.endsWith("/worker.mjs")) headers["content-security-policy"] = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'";
    if (/\bgzip\b/.test(req.headers["accept-encoding"] ?? "") && /\.(wasm|json|mjs|ndjson)$/.test(file)) {
      // Compressed once per content, not per path: the manifest changes between runs.
      const key = file + ":" + body.length + ":" + (await stat(file)).mtimeMs;
      if (!zipped.has(key)) zipped.set(key, gzipSync(body, { level: 9 }));
      body = zipped.get(key);
      headers["content-encoding"] = "gzip";
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
server.listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}/bench.html`));
