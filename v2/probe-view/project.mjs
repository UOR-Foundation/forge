// Loads the data form of every module under data/ as one interpreted project.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject } from "../shell/interp.mjs";

const root = fileURLToPath(new URL("data", import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const moduleName = (p) => relative(root, p).slice(0, -".json".length).split(sep).join(".");
export const modules = Object.fromEntries(walk(root).filter((p) => !p.endsWith("modules.json")).map((p) => [moduleName(p), JSON.parse(readFileSync(p, "utf8"))]));
export const project = loadProject(modules);
