// A stand-in for the live frame (studio/live-src/src/frame.jsx): it keeps nodes by key and kappa,
// redraws only what changed, and reports each paint with its own clock reading, as the real frame
// reports `live/painted`. The probe's clock puts its readings on the page's time line.
import { now } from "./probe.mjs";
const nodes = new Map();
const host = document.getElementById("nodes"), title = document.getElementById("title");
const text = (n) => n.data.text ?? n.data.label ?? (n.data.then != null ? `${n.kind} ${n.data.index ?? ""}: ${JSON.stringify(n.data.then)}` : JSON.stringify(n.data.request ?? n.data).slice(0, 120));
function apply(m) {
  const t0 = performance.now();
  title.textContent = m.title || "Untitled";
  const seen = new Set();
  for (const n of m.nodes) {
    seen.add(n.key);
    const had = nodes.get(n.key);
    if (had && had.kappa === n.kappa) continue;
    const el = had ? had.el : host.appendChild(document.createElement("div"));
    el.className = "node";
    el.innerHTML = "";
    const k = el.appendChild(document.createElement("span")); k.className = "k"; k.textContent = n.kind;
    el.appendChild(document.createTextNode(text(n)));
    nodes.set(n.key, { kappa: n.kappa, el });
  }
  for (const [key, had] of nodes) if (!seen.has(key)) { had.el.remove(); nodes.delete(key); }
  void host.offsetHeight; // layout now, so the work measured includes it
  const work = Math.round((performance.now() - t0) * 1000);
  // The next animation frame is the frame this change is painted in; its reading is the pixel time.
  requestAnimationFrame(() => parent.postMessage({ type: "replay/painted", at: now(), work, edit: !!m.edit }, location.origin));
}
addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.source !== parent) return;
  if (e.data?.type === "replay/projection") apply(e.data);
  // A user's edit, started here as the real frame starts one: the edit's own time is read here.
  if (e.data?.type === "replay/edit") parent.postMessage({ type: "replay/patch", at: now(), title: e.data.title }, location.origin);
});
parent.postMessage({ type: "replay/hello", at: now() }, location.origin);
