// Development only: serves the files the reuse page imports, from the repository root, on 127.0.0.1.
// Run: node v2/reuse/serve.mjs   then open http://127.0.0.1:4180/v2/reuse/opfs.html
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const allowed = ["v2/reuse/", "v2/shell/interp.mjs", "v2/probe/Probe.json", "studio/shell/prism-code/src/blake3.mjs"].map((p) => normalize(join(root, p)));
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".json": "application/json" };
const port = Number(process.env.PORT ?? 4180);

const server = createServer(async (req, res) => {
  const file = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || !allowed.some((a) => file === a || file.startsWith(a))) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }); res.end(body); }
  catch { res.writeHead(404); res.end("not found"); }
});
server.listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}/v2/reuse/opfs.html`));
