// A replayed build turn, measured. The model's answer is canned (a real LexLean module, the shell's
// fixture verdant.lex.tex) and released on a schedule; everything after the model is the shell's own
// code doing its own work: the reader (readLexLeanPartial, specFromTurn) and the projector (project)
// from studio/shell/live, a frame in its own browsing context, real paints, a real edit round trip.
//
// Measured for real: preview frame, first pixel, work per update, edit to screen, module complete to
// Checked, reloads, reads. Replayed on a schedule: the model's thinking, lead and writing, divided by
// `speed` (100 by default, so a 3-minute turn plays in about 2 seconds). The KPIs that include model
// time (declaration, built) therefore show the schedule, not a model.
import { partialFromTurn, specFromTurn } from "../../studio/shell/live/lexlean.mjs";
import { project } from "../../studio/shell/live/project.mjs";

const SCHEDULE = { think: 90e3, lead: 20e3, write: 60e3 }; // ms of model time in the replayed turn
const CHUNK = 600;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function replayTurn({ probe, KIND, container, moduleText, speed = 100 }) {
  const mark = (kind, value = 0, at) => probe.mark(KIND[kind], value, 0, at);
  const origin = location.origin;
  mark("enter");
  container.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.title = "Replay preview";
  let loads = 0, frameWin = null, onPainted = null, onPatch = null;
  const hello = new Promise((resolve) => {
    addEventListener("message", function listen(e) {
      if (e.origin !== origin || e.source !== frame.contentWindow) return;
      const m = e.data;
      if (m?.type === "replay/hello") resolve(m.at);
      if (m?.type === "replay/painted") onPainted?.(m);
      if (m?.type === "replay/patch") onPatch?.(m);
      if (m?.type === "replay/done") removeEventListener("message", listen);
    });
  });
  frame.addEventListener("load", () => { if (++loads > 1) mark("reload"); });
  frame.src = new URL("./frame.html", import.meta.url).href;
  container.appendChild(frame);
  mark("frame", 0, await hello);
  frameWin = frame.contentWindow;

  // Paints: every one is an update (its work) and a pixel (its time); an edit's paint ends the edit.
  let paints = 0;
  onPainted = (m) => { paints++; mark("update", m.work); mark("pixel", 0, m.at); if (m.edit) mark("editScreen", 0, m.at); };
  // Projections are coalesced to one per animation frame, as the shell's pushLive does.
  let latest = null, scheduled = false, declared = false;
  const post = (spec, edit = false) => {
    const p = project(spec);
    frameWin.postMessage({ type: "replay/projection", title: p.title, nodes: p.nodes, root: p.root, edit }, origin);
  };
  const push = (spec) => { latest = spec; if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; post(latest); }); };

  const turn = "<prism-lexlean>\n" + moduleText + "\n</prism-lexlean>\n";
  await wait(SCHEDULE.think / speed);
  mark("token");
  const chunks = Math.ceil(turn.length / CHUNK);
  // The lead is the time from the first token to the first whole declaration, set by how fast the model
  // writes; the replay writes the first part of the answer over the lead, the rest over the write time.
  let full = "";
  for (let i = 0; i < chunks; i++) {
    full = turn.slice(0, (i + 1) * CHUNK);
    const part = partialFromTurn(full);
    if (part) { if (!declared) { declared = true; mark("declaration"); } push(part.spec); }
    await wait((declared ? SCHEDULE.write : SCHEDULE.lead) / speed / chunks);
  }
  mark("complete");
  const read = specFromTurn(full);
  if (read && !read.error) { mark("read", 1); mark("rechecked"); mark("checked"); push(read.spec); }
  else mark("refused");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait(50);

  // An edit, from the frame: it reads its own clock when the edit starts and sends the patch; the host
  // applies it and the frame paints it.
  if (read && !read.error) {
    const edited = new Promise((resolve) => { const prev = onPainted; onPainted = (m) => { prev(m); if (m.edit) resolve(); }; });
    onPatch = (m) => { mark("edit", 0, m.at); post({ ...read.spec, title: m.title }, true); };
    frameWin.postMessage({ type: "replay/edit", title: read.spec.title + " (edited)" }, origin);
    await edited;
  }
  return { ...probe.drain(), paints, loads };
}
