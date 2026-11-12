// Development only: serves a built site from a folder, as a static host would.
// Run: node v2/site/serve.mjs <folder> [port]     (PORT in the environment also sets the port)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const port = Number(process.env.PORT || process.argv[3] || 4180);
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".tex": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8" };
createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(root, path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }); res.end(body); }
  catch { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found: " + path); }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
