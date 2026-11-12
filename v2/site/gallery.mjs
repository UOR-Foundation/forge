// The v2 page: runs each listed spec in this tab and shows, beside it, exactly what is proved,
// what is only tested, and what is not established. Every word about proof comes from apps.json,
// which build.mjs reads from the specs.
import { loadProject, NIL, cons } from "../shell/interp.mjs";
import { createView, fieldValue } from "../shell/render.mjs";

const root = new URL("../", import.meta.url);
const $ = (id) => document.getElementById(id);
const json = async (path) => { const r = await fetch(new URL(path, root)); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };
const el = (tag, text, parent) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; parent?.append(e); return e; };
const list = (items) => items.reduceRight((tail, head) => cons(head, tail), NIL);
const VALID = "Foundation.View.Browser.V1.Model::presentationValid";

const started = performance.now();
const site = await json("site/apps.json");
const names = (await json(site.library + "/modules.json")).filter((n) => n.startsWith("Foundation."));
const library = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await json(`${site.library}/${n.replaceAll(".", "/")}.json`)])));
const draw = createView($("app"), (action, fields) => current?.act(action, fields));
let current = null;

async function open(app) {
  const t0 = performance.now();
  const own = Object.fromEntries(await Promise.all(Object.entries(app.modules).map(async ([name, path]) => [name, await json(path)])));
  const project = loadProject({ ...library, ...own });
  const catalogue = []; for (let l = project.call(app.entry + "::catalogue"); l.c === "List.cons"; l = l.a[1]) catalogue.push(l.a[0]);
  let state = project.call(app.entry + "::initial");
  const show = () => {
    const frame = project.call(app.entry + "::view", state);
    // The protocol's own rule decides whether a frame may be drawn.
    if (!project.call(VALID, frame)) throw new Error("the spec produced a frame the protocol does not admit");
    draw(frame, catalogue);
  };
  current = {
    app,
    act(action, fields) {
      const t = performance.now();
      state = project.call(app.entry + "::step", state, { revision: state.revision, action, fields: list(fields.map(fieldValue)) });
      show();
      const ms = performance.now() - t;
      $("timing").textContent = `Last action reached the page in ${ms.toFixed(2)} ms.`;
      return ms;
    },
    get state() { return state; },
  };
  show();
  describe(app, project, performance.now() - t0);
}

function describe(app, project, ms) {
  $("title").textContent = app.title;
  $("origin").textContent = app.origin + (app.sentence ? ` The sentence: "${app.sentence}"` : "");
  $("runs").textContent = `Runs in this tab: ${project.definitions.length} definitions interpreted from the spec's own data form, with no compiled code. Opened in ${ms.toFixed(0)} ms.`;
  $("timing").textContent = "";
  $("attestation").textContent = app.attestation;
  $("tested").textContent = app.tested;
  $("source").href = new URL(app.source, root).href;
  const body = $("proved"); body.textContent = "";
  for (const t of app.proved) {
    const row = el("tr", undefined, body);
    el("td", t.sentence, row);
    el("code", t.statement, el("td", undefined, row));
    el("td", t.form.replaceAll("_", " ") + (t.axioms.length ? `, using ${t.axioms.join(", ")}` : ", no axioms"), row);
    const note = el("td", t.limit ?? "The theorem says what the sentence says.", row);
    if (t.limit) note.className = "limit";
  }
  const open = $("unproved"); open.textContent = "";
  for (const sentence of app.unproved) el("li", sentence, open);
  $("unproved-block").hidden = app.unproved.length === 0;
}

const nav = $("apps");
for (const app of site.apps) {
  const b = el("button", app.title, nav); b.type = "button"; b.dataset.app = app.id;
  b.addEventListener("click", async () => { for (const other of nav.children) other.setAttribute("aria-pressed", String(other === b)); await open(app); });
}
nav.firstElementChild.setAttribute("aria-pressed", "true");
await open(site.apps[0]);
$("load").textContent = `Page ready in ${(performance.now() - started).toFixed(0)} ms.`;
document.documentElement.dataset.ready = "true";
window.gallery = { open: (id) => open(site.apps.find((a) => a.id === id)), act: (action, fields) => current.act(action, fields), get state() { return current.state; }, apps: site.apps };
