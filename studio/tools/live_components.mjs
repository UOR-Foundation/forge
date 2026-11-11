// The live frame's components: real shadcn/ui, compiled once. Which style is one line, `style` in
// live-src/style.json (with the `ui` and `lib` paths that style keeps in the registry); everything else
// follows from it.
//
//   node tools/live_components.mjs --vendor   copy the style's components, verbatim, from the brand kit's
//                                             vendored shadcn registry at style.json's kit commit, and
//                                             record their digests (needs the GitHub CLI, signed in)
//   node tools/live_components.mjs --build    compile them into shell/live/components.js (React, Radix and
//                                             the components, one script) and shell/live/components.css
//                                             (Tailwind, against the brand kit's tokens); and, for the
//                                             published page, shell/live/card-render.mjs (the same view,
//                                             rendered to markup at publish) and shell/live/card.css (the
//                                             same sheet, its base layer kept inside the card)
//   node tools/live_components.mjs --check    the vendored files match their record, and a fresh build is
//                                             byte for byte the committed one
//
// To change the style: set `style`, `ui` and `lib` in live-src/style.json, run --vendor, then --build. The
// toolchain is live-src/package.json, pinned to the brand kit showcase's own lockfile, installed with
// `npm ci` in live-src.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "live-src");
const style = JSON.parse(fs.readFileSync(path.join(src, "style.json"), "utf8"));
const vendor = path.join(root, "vendor", "shadcn-ui");
const registry = path.join(vendor, "registry");
const record = path.join(vendor, "VENDORED.sha256");
const out = path.join(root, "shell", "live");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const text = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// The vendored files: each component, the `cn` helper, and any sibling component a component imports.
function vendoredPaths() {
  const paths = new Set([style.lib]);
  const queue = style.components.map((c) => `${style.ui}/${c}.tsx`);
  while (queue.length) {
    const p = queue.shift();
    if (paths.has(p)) continue;
    paths.add(p);
    const file = path.join(registry, p);
    if (!fs.existsSync(file)) continue;
    for (const m of text(file).matchAll(/from "@\/registry\/([^"]+)"/g)) queue.push(m[1] + ".tsx");
  }
  return [...paths].sort();
}

function gh(p) {
  return execFileSync("gh", ["api", `repos/Hologram-Technologies/hologram-brand-kit/contents/${style.registry}/${p}?ref=${style.kit}`, "-H", "Accept: application/vnd.github.raw"], { maxBuffer: 1 << 24 });
}

if (process.argv.includes("--vendor")) {
  fs.rmSync(registry, { recursive: true, force: true });
  const done = new Set();
  const queue = [style.lib, ...style.components.map((c) => `${style.ui}/${c}.tsx`)];
  while (queue.length) {
    const p = queue.shift();
    if (done.has(p)) continue;
    done.add(p);
    const bytes = gh(p);
    fs.mkdirSync(path.dirname(path.join(registry, p)), { recursive: true });
    fs.writeFileSync(path.join(registry, p), bytes);
    for (const m of bytes.toString("utf8").matchAll(/from "@\/registry\/([^"]+)"/g)) queue.push(m[1] + ".tsx");
  }
  fs.writeFileSync(path.join(vendor, "LICENSE.md"), execFileSync("gh", ["api", `repos/Hologram-Technologies/hologram-brand-kit/contents/brand/vendor/shadcn-ui/LICENSE.md?ref=${style.kit}`, "-H", "Accept: application/vnd.github.raw"]));
  const rows = vendoredPaths().map((p) => `${sha(text(path.join(registry, p)))}  registry/${p}`);
  fs.writeFileSync(record, rows.join("\n") + "\n");
  console.log(`vendored ${rows.length} files of shadcn/ui ${style.style} from the brand kit at ${style.kit.slice(0, 12)}`);
}

// ---- the build
async function build() {
  const esbuild = await import(path.join(src, "node_modules", "esbuild", "lib", "main.js").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
  const resolveFile = (base) => [".tsx", ".ts", ".jsx", ".js", ""].map((e) => base + e).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  const alias = {
    name: "registry",
    setup(b) {
      b.onResolve({ filter: /^@\/(lib\/utils|ui\/|registry\/)/ }, (args) => {
        const rest = args.path.slice(2);
        const target = rest === "lib/utils" ? path.join(registry, style.lib.replace(/\.ts$/, ""))
          : rest.startsWith("ui/") ? path.join(registry, style.ui, rest.slice(3))
          : path.join(registry, rest.slice("registry/".length));
        const file = resolveFile(target);
        return file ? { path: file } : { errors: [{ text: `not vendored: ${args.path} (run --vendor)` }] };
      });
    },
  };
  const result = await esbuild.build({
    entryPoints: [path.join(src, "src", "frame.jsx")], bundle: true, write: false, format: "iife", platform: "browser", target: "es2020",
    minify: true, jsx: "automatic", legalComments: "none", plugins: [alias], nodePaths: [path.join(src, "node_modules")], absWorkingDir: src,
    define: { "process.env.NODE_ENV": '"production"', __STYLE__: JSON.stringify(style.style) }, logLevel: "error",
  });
  const js = result.outputFiles[0].text;
  const render = await esbuild.build({
    entryPoints: [path.join(src, "src", "card-render.jsx")], bundle: true, write: false, format: "esm", platform: "neutral", mainFields: ["module", "main"], conditions: ["browser"], target: "es2020",
    minify: true, jsx: "automatic", legalComments: "none", plugins: [alias], nodePaths: [path.join(src, "node_modules")], absWorkingDir: src,
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error",
  });
  const cardRender = render.outputFiles[0].text;

  // Tailwind scans the frame and the vendored components; the theme maps the kit's variables (brand.css,
  // inlined before this sheet in the frame) onto Tailwind's slots, as the kit's own showcase does.
  const work = path.join(src, ".build");
  fs.mkdirSync(work, { recursive: true });
  const rel = (p) => path.relative(work, p).replace(/\\/g, "/");
  // source(none): Tailwind scans only the two sources named here, never whatever else sits in the
  // working directory, so the sheet depends on the components and the frame alone.
  const entry = `@import "tailwindcss" source(none);\n@import "tw-animate-css";\n@source "${rel(path.join(registry, style.ui))}";\n@source "${rel(path.join(src, "src"))}";\n` + text(path.join(src, "theme.css"));
  fs.writeFileSync(path.join(work, "entry.css"), entry);
  const cli = path.join(src, "node_modules", "@tailwindcss", "cli", "dist", "index.mjs");
  execFileSync(process.execPath, [cli, "-i", path.join(work, "entry.css"), "-o", path.join(work, "out.css"), "--minify"], { cwd: src, stdio: ["ignore", "ignore", "pipe"] });
  const css = text(path.join(work, "out.css"));
  const banner = `/* shadcn/ui ${style.style} (MIT, (c) shadcn) from the Hologram brand kit at ${style.kit}; React and Radix (MIT). Built by tools/live_components.mjs; do not edit. */\n`;
  return { js: banner + js + "\n", css: banner + css + "\n", cardRender: banner + cardRender + "\n", cardCss: banner + cardSheet(css) + "\n" };
}

// The card's sheet, for the published page, where it sits beside the page's own (prism-page.css): the
// same compiled sheet with Tailwind's base layer (preflight, and theme.css's base rules) kept inside the
// card, so the page's chrome is untouched, and a reset that takes the page's own unlayered rules (button,
// input, h1, main...) off the card, so inside it only this sheet applies, as in the preview.
export function cardSheet(css) {
  const open = css.indexOf("@layer base{");
  if (open < 0) throw new Error("card.css: the sheet has no base layer");
  const start = open + "@layer base{".length;
  let depth = 1, i = start;
  for (; depth; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
  const scope = (sel) => sel.split(",").map((part) => {
    const s = part.trim();
    if (/^(html|:host|body)$/.test(s)) return ".prism-card";
    if (s === "*") return ".prism-card,:where(.prism-card) *";
    return ":where(.prism-card) " + s;
  }).join(",");
  const scoped = (body) => body.replace(/(^|[{};])([^{};@]+)\{/g, (m, before, sel) => before + scope(sel) + "{");
  const base = css.slice(start, i - 1);
  const card = "#stage .prism-card,#stage .prism-card *,#stage .prism-card :before,#stage .prism-card :after{all:revert-layer}" +
    "#stage .board-fit>.prism-card{width:100%;height:100%;overflow-y:auto;place-self:stretch}" +
    // What the page holds when it loads is drawn at rest: the page's first paint is its largest one, which the
    // template's Lighthouse gate times (LCP under 1.5 s), so nothing may fade in from transparent. card.mjs
    // marks the card started; what it mounts after that enters as in the preview.
    "#stage .prism-card:not([data-started]) .animate-in{animation:none}";
  return css.slice(0, start) + scoped(base) + css.slice(i - 1) + card;
}

if (process.argv.includes("--build") || process.argv.includes("--check")) {
  const bad = [];
  if (process.argv.includes("--check")) {
    const recorded = new Map(text(record).split("\n").filter(Boolean).map((l) => { const [h, p] = l.split(/\s+/); return [p, h]; }));
    for (const p of vendoredPaths()) {
      const file = path.join(registry, p);
      if (!fs.existsSync(file)) bad.push(`registry/${p} is not vendored`);
      else if (recorded.get(`registry/${p}`) !== sha(text(file))) bad.push(`registry/${p} differs from its record`);
    }
  }
  const t0 = performance.now();
  const built = await build();
  const { js, css } = built;
  const ms = Math.round(performance.now() - t0);
  const { cardRender, cardCss } = built;
  const files = { "components.js": js, "components.css": css, "card-render.mjs": cardRender, "card.css": cardCss };
  if (process.argv.includes("--check")) {
    for (const [name, body] of Object.entries(files)) {
      const p = path.join(out, name);
      if (!fs.existsSync(p) || text(p) !== body) bad.push(`shell/live/${name} differs from a fresh build`);
    }
    if (bad.length) { console.log("components refused:\n" + bad.join("\n")); process.exit(1); }
    console.log(`components: shadcn/ui ${style.style}, ${vendoredPaths().length} vendored files match, the build is byte for byte the committed one (${ms} ms)`);
  } else {
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(out, name), body);
    console.log(`built shell/live/components.js (${js.length} bytes) and components.css (${css.length} bytes) in ${ms} ms, shadcn/ui ${style.style}`);
  }
}
