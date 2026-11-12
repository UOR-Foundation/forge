// Development only: serves the telemetry panel and the shell files it imports, from the repository root,
// on 127.0.0.1. Run: node v2/telemetry/serve.mjs   (PORT=0 picks a free port)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const allowed = ["v2/telemetry/", "v2/shell/interp.mjs", "studio/shell/live/", "studio/shell/prism/", "studio/shell/prism.js", "studio/shell/prism-code/src/", "studio/tools/fixtures/live/"].map((p) => normalize(join(root, p)));
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".tex": "text/plain; charset=utf-8" };
const port = Number(process.env.PORT ?? 4231);

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // JSON handed to the page as a script module, so it can be imported under the page's policy.
  const module = (value) => { res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }); res.end(`export default ${JSON.stringify(value)};\n`); };
  if (path === "/v2/telemetry/replay-module.json.mjs") return module({ path: "studio/tools/fixtures/live/verdant.lex.tex", text: await readFile(join(root, "studio/tools/fixtures/live/verdant.lex.tex"), "utf8") });
  // Any JSON file under v2/telemetry, as a script module (see panel.mjs).
  if (path.startsWith("/v2/telemetry/") && path.endsWith(".json.mjs")) {
    try { return module(JSON.parse(await readFile(normalize(join(root, path.slice(0, -4))), "utf8"))); } catch { res.writeHead(404); return res.end(); }
  }
  const file = normalize(join(root, path));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || !allowed.some((a) => file === a || file.startsWith(a))) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }); res.end(body); }
  catch { res.writeHead(404); res.end("not found"); }
});
server.listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}/v2/telemetry/panel.html`));
