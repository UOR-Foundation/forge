// Development: serves v2/in-tab-kernel/ on localhost with no COOP or COEP header, so the page is not cross-origin
// isolated, as on a static host that cannot set headers. The worker is served with connect-src 'none'.
//   node web/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const types = { ".html": "text/html", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".ndjson": "application/x-ndjson" };
const port = Number(process.argv[2] ?? 8793);
createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    const headers = { "content-type": types[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" };
    if (path.endsWith("worker.mjs")) headers["content-security-policy"] = "connect-src 'none'";
    res.writeHead(200, headers).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(port, () => console.log(`http://localhost:${port}/web/bench.html`));
