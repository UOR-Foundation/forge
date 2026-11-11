// The live frame on shadcn/ui: one React tree that draws any Prism app from its projection. Every node is
// a memoised component compared by its kappa, so a change to the spec re-renders the nodes whose kappa
// changed and leaves every other one, every typed value and the scroll position as they were. The
// components are the brand kit's vendored shadcn/ui, at the style live-src/style.json names; the answer
// comes from the interpreter every app's rule module ships (prismAnswer, prismDecide, inlined before this
// bundle from shell/prism.js). The frame is served in the preview sandbox with no network: the spec
// arrives by postMessage from the page that framed it.
/* global prismAnswer, prismDecide */
import { createContext, memo, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { CheckIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/ui/toggle-group";
import { cn } from "@/lib/utils";
import { tableKernel } from "../../shell/live/table.mjs";

const TRUST = { draft: "Draft", drafting: "Draft", checked: "Checked", proving: "Lean is proving", proved: "Proved by Lean", published: "Proved by Lean · published" };

// ---- the store: the projection as it stands, and what the user has typed
let state = { app: "", root: null, nodes: [], logic: null, logicKappa: null, trust: "", theme: "light", values: {}, table: null, diff: null };
const listeners = new Set();
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
const snapshot = () => state;
const emit = () => listeners.forEach((l) => l());
let renders = 0;

function defaults(logic, old) {
  const values = {};
  for (const f of (logic && logic.fields) || []) {
    const v = old[f.name];
    if (f.kind === "choice") values[f.name] = f.values.includes(v) ? v : f.values[0];
    else { const n = Number(v); values[f.name] = v !== undefined && /^(0|[1-9][0-9]*)$/.test(v) && n >= f.min && (f.max === undefined || n <= f.max) ? v : String(f.min); }
  }
  return values;
}
function setValues(patch) { state = { ...state, values: { ...state.values, ...patch } }; emit(); }

// ---- the decision table, built off the main thread per logic kappa (shell/live/table.mjs). Until it
// arrives, and for a domain too large to tabulate, the interpreter answers.
const K = tableKernel();
let worker = null, offMain = true;
function tableWorker() {
  if (worker) return worker;
  const source = "const K = (" + tableKernel.toString() + ")(); let prev = null;\n" +
    "onmessage = ({ data }) => { const t0 = performance.now(); const t = K.build(data.logic); const ms = performance.now() - t0;\n" +
    "  if (!t.cells) { postMessage({ kappa: data.kappa, reason: t.reason, size: t.size, ms }); return; }\n" +
    "  const checks = K.check(data.logic, t); const diff = prev ? K.diff(prev.logic, prev.table, data.logic, t) : null; prev = { logic: data.logic, table: t };\n" +
    "  const cells = t.cells.slice(); postMessage({ kappa: data.kappa, size: t.size, cells, radix: t.radix, base: t.base, lists: t.lists, checks, diff, ms }, [cells.buffer]); };";
  const onmessage = ({ data }) => {
    if (data.kappa !== state.logicKappa) return;
    state = { ...state, table: data, diff: data.diff && state.showDiff ? data.diff : null };
    emit();
    parent.postMessage({ type: "live/table", app: state.app, size: data.size, ms: Math.round(data.ms * 10) / 10, offMain, reason: data.reason || null }, "*");
  };
  try { worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" }))); worker.onmessage = onmessage; }
  catch (e) {
    // No worker in this sandbox: the same kernel on this thread, and the report says so.
    offMain = false;
    let prev = null;
    worker = { postMessage(data) { setTimeout(() => {
      const t0 = performance.now(); const t = K.build(data.logic); const ms = performance.now() - t0;
      const msg = !t.cells ? { kappa: data.kappa, reason: t.reason, size: t.size, ms } : { kappa: data.kappa, size: t.size, cells: t.cells, radix: t.radix, base: t.base, lists: t.lists, checks: K.check(data.logic, t), diff: prev ? K.diff(prev.logic, prev.table, data.logic, t) : null, ms };
      if (t.cells) prev = { logic: data.logic, table: t };
      onmessage({ data: msg });
    }, 0); } };
  }
  return worker;
}

// ---- the dynamic part: the answer, the rule that decides it, which examples pass
function evaluate(logic, values, table, logicKappa) {
  const ready = !!(logic && logic.otherwise && logic.fields && logic.fields.length);
  if (!ready) return { ready, answer: null, fires: -1, request: "" };
  const spec = { fields: logic.fields, rules: logic.rules, otherwise: logic.otherwise };
  const request = logic.fields.map((f) => String(values[f.name])).join(" ");
  let answer, fires = -1;
  const t = table && table.cells && table.kappa === logicKappa ? table : null;
  const cell = t ? K.cellOf(logic, t, values) : -2;
  if (cell >= 0) { fires = t.cells[cell]; answer = fires < spec.rules.length ? spec.rules[fires].then : spec.otherwise; } // one read
  else if (t) answer = "invalid";
  else {
    answer = prismDecide(spec, values);
    if (answer !== "invalid") {
      fires = spec.rules.length;
      for (let i = 0; i < spec.rules.length; i++) if (prismAnswer({ ...spec, rules: spec.rules.slice(0, i + 1), otherwise: "\u0000" }, request) !== "\u0000") { fires = i; break; }
    }
  }
  const passes = (req, res) => prismAnswer(spec, req) === res;
  const checks = t ? t.checks : null;
  const broken = new Set((checks || []).filter((c) => !c.ok).map((c) => c.rule));
  return { ready, answer, fires, request, passes, rules: spec.rules.length, checks, broken, size: t ? t.size : 0, reason: table && table.kappa === logicKappa ? table.reason || null : null };
}
const Live = createContext({ ready: false, values: {} });
const NodeKey = createContext("");

// ---- editing in place. A word on the screen is a place in the spec (the node's `edit` paths, from
// shell/live/project.mjs). Clicking it makes it a field; Enter, or leaving it, sends a spec patch to the
// page that framed this one, which checks it and sends back the new projection, or a refusal that is
// shown on this node. The screen itself is never edited.
const post = (message) => parent.postMessage({ app: state.app, ...message }, "*");
function Editable({ path, value, className, onDouble = false }) {
  const key = useContext(NodeKey);
  const [editing, setEditing] = useState(false);
  const text = value == null ? "" : String(value);
  if (!path) return <span className={className}>{text}</span>;
  const commit = (next) => { setEditing(false); if (next !== text && next.trim() !== "") post({ type: "live/patch", key, base: state.root, ops: [{ op: "set", path, value: next.trim() }] }); };
  if (editing) return (
    <input autoFocus defaultValue={text} aria-label="edit" style={{ width: Math.max(3, text.length + 2) + "ch" }}
      className={cn("-mx-1 max-w-full rounded-sm bg-background px-1 text-inherit outline-none ring-2 ring-ring", className)}
      onClick={(e) => e.stopPropagation()} onFocus={(e) => e.target.select()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(e.currentTarget.value); else if (e.key === "Escape") setEditing(false); }}
      onBlur={(e) => commit(e.currentTarget.value)} />
  );
  const open = (e) => { if (e.altKey) return; e.preventDefault(); e.stopPropagation(); setEditing(true); };
  return (
    <span title={onDouble ? "Double-click to edit" : "Click to edit"} className={cn("cursor-text rounded-sm decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:underline", className)}
      {...(onDouble ? { onDoubleClick: open } : { onClick: open, role: "button", tabIndex: 0, onKeyDown: (e) => { if (e.key === "Enter") open(e); } })}>{text}</span>
  );
}

// ---- one node
function Field({ data }) {
  const { values } = useContext(Live);
  const f = data.field, v = values[f.name] ?? "", id = "f-" + f.name;
  const step = (d) => { const n = (parseInt(v, 10) || 0) + d; setValues({ [f.name]: String(Math.max(f.min, f.max === undefined ? n : Math.min(f.max, n))) }); };
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}><Editable path={data.edit && data.edit.label} value={data.label} /></Label>
      {f.kind === "choice" && f.values.length <= 5 ? (
        <ToggleGroup id={id} type="single" variant="outline" className="w-full" value={v} onValueChange={(x) => x && setValues({ [f.name]: x })}>
          {f.values.map((x) => <ToggleGroupItem key={x} value={x} className="flex-1">{x}</ToggleGroupItem>)}
        </ToggleGroup>
      ) : f.kind === "choice" ? (
        <Select value={v} onValueChange={(x) => setValues({ [f.name]: x })}>
          <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{f.values.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="less" onClick={() => step(-1)}><MinusIcon /></Button>
          <Input id={id} type="number" inputMode="numeric" step={1} min={f.min} max={f.max} className="text-center tabular-nums" value={v} onChange={(e) => setValues({ [f.name]: e.target.value })} />
          <Button variant="outline" size="icon" aria-label="more" onClick={() => step(1)}><PlusIcon /></Button>
        </div>
      )}
    </div>
  );
}
function Answer({ data }) {
  const { ready, answer, fires, rules } = useContext(Live);
  const meaning = answer && data.meanings ? data.meanings[answer] : "";
  const because = !ready ? "" : answer === "invalid" ? "Not a valid request" : fires < rules ? `Rule ${fires + 1} decides` : "No rule matches, so the otherwise answer";
  return (
    <Card className="mt-2 gap-3">
      <CardHeader>
        <CardDescription><Editable path={data.edit && data.edit.label} value={data.label} /></CardDescription>
        <CardTitle key={answer} className={cn("font-display text-4xl tracking-tight animate-in fade-in-0 slide-in-from-bottom-1 duration-200", answer === "invalid" || !ready ? "text-muted-foreground" : "text-brand")}>{ready ? answer : "—"}</CardTitle>
      </CardHeader>
      {(meaning || because) && <CardContent className="grid gap-1">{meaning && <p><Editable path={data.edit && data.edit.meaning ? [...data.edit.meaning, answer] : null} value={meaning} /></p>}{because && <p className="text-sm text-muted-foreground">{because}</p>}</CardContent>}
    </Card>
  );
}
function Rule({ kind, data }) {
  const { fires, broken } = useContext(Live);
  const on = fires === data.index, bad = broken && broken.has(data.index);
  return (
    <div className={cn("rounded-lg border px-4 py-3 transition-colors", on && "border-brand bg-brand/5", bad && "border-destructive bg-destructive/5")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{kind === "rule" ? "When " + data.when : "Otherwise"}</span>
        <Badge variant={on ? "default" : "secondary"} className={cn(on && "bg-brand text-brand-foreground")}><Editable path={data.edit && data.edit.then} value={data.then} /></Badge>
      </div>
      {data.why && <p className="mt-1 text-sm text-muted-foreground"><Editable path={data.edit && data.edit.why} value={data.why} /></p>}
    </div>
  );
}
function Guarantee({ data }) {
  const { checks, size, reason, trust } = useContext(Live);
  const c = checks ? checks[data.index] : null;
  const proved = trust === "proved" || trust === "published";
  const n = (x) => x.toLocaleString("en");
  return (
    <div className={cn("rounded-lg border px-4 py-3", c && !c.ok && "border-destructive")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{data.kind === "never" ? "Never" : "Always"} <Editable path={data.edit && data.edit.then} value={data.then} /> when {data.when}</span>
        {proved ? <Badge className="bg-brand text-brand-foreground">Proved by Lean</Badge>
          : c && c.ok ? <Badge variant="outline"><CheckIcon className="text-brand" />Tested on all {n(size)}</Badge>
          : c ? <Badge variant="destructive">Broken</Badge>
          : <Badge variant="secondary">{reason ? "Not tabulated" : "Checking"}</Badge>}
      </div>
      {c && !c.ok ? <p className="mt-1 text-sm text-destructive"><span className="font-mono">{c.request}</span> answers {c.outcome}, by {c.rule < ((state.logic && state.logic.rules.length) || 0) ? "rule " + (c.rule + 1) : "otherwise"}.</p>
        : data.why ? <p className="mt-1 text-sm text-muted-foreground"><Editable path={data.edit && data.edit.why} value={data.why} /></p> : null}
      {reason && !c && <p className="mt-1 text-sm text-muted-foreground">{reason}; Lean will check it for every request.</p>}
    </div>
  );
}
function Example({ data }) {
  const { ready, request, passes } = useContext(Live);
  const pass = ready ? passes(data.request, data.response) : null;
  const fill = () => { const parts = data.request.split(" "); const patch = {}; (state.logic?.fields || []).forEach((f, i) => { if (parts[i] !== undefined) patch[f.name] = parts[i]; }); setValues(patch); };
  return (
    <Button variant="outline" size="sm" onClick={fill} className={cn("self-start rounded-full font-mono", ready && request === data.request && "border-foreground", pass === false && "border-destructive")}>
      <Editable onDouble path={data.edit && data.edit.request} value={data.request} /><span className="text-muted-foreground">→</span><Editable onDouble path={data.edit && data.edit.response} value={data.response} />
      {pass === true ? <CheckIcon className="text-brand" /> : pass === false ? <XIcon className="text-destructive" /> : null}
    </Button>
  );
}
const Node = memo(function Node({ node, gap, pointed, refused }) {
  renders++;
  const ref = useRef(null), seen = useRef(node.kappa);
  // A node whose kappa changed (not a new one) flashes once, so the eye finds what the edit touched.
  useLayoutEffect(() => {
    if (seen.current === node.kappa || !ref.current) return;
    seen.current = node.kappa;
    ref.current.classList.remove("animate-flash"); void ref.current.offsetWidth; ref.current.classList.add("animate-flash");
  }, [node.kappa]);
  const d = node.data;
  const body = node.kind === "heading" ? <h1 className="font-display text-4xl font-semibold tracking-tight text-balance"><Editable path={d.edit && d.edit.text} value={d.text} /></h1>
    : node.kind === "text" ? <p className="leading-7 text-muted-foreground"><Editable path={d.edit && d.edit.text} value={d.text} /></p>
    : node.kind === "input" ? <Field data={d} />
    : node.kind === "answer" ? <Answer data={d} />
    : node.kind === "rule" || node.kind === "otherwise" ? <Rule kind={node.kind} data={d} />
    : node.kind === "property" ? <Guarantee data={d} />
    : node.kind === "example" ? <Example data={d} /> : null;
  // Alt+click points the agent at this node: the next thing the user asks is about it.
  const point = (e) => { if (!e.altKey) return; e.preventDefault(); e.stopPropagation(); post({ type: "live/point", key: node.key, kind: node.kind, edit: d.edit || {}, text: d.text || d.label || d.then || d.request || "" }); state = { ...state, pointed: state.pointed === node.key ? null : node.key }; emit(); };
  return (
    <NodeKey.Provider value={node.key}>
      <div ref={ref} data-key={node.key} data-kappa={node.kappa} onClickCapture={point} className={cn("flex flex-col rounded-lg animate-in fade-in-0 slide-in-from-bottom-1 duration-300", gap && "mt-3", pointed && "ring-2 ring-brand ring-offset-4 ring-offset-background")}>
        {body}
        {refused && <p className="mt-1 text-sm text-destructive animate-in fade-in-0">{refused}</p>}
      </div>
    </NodeKey.Provider>
  );
}, (a, b) => a.node.kappa === b.node.kappa && a.gap === b.gap && a.pointed === b.pointed && a.refused === b.refused);

// What an edit of the rules changed, answer by answer, over every request.
function Diff({ diff }) {
  const n = (x) => x.toLocaleString("en");
  const show = (request) => { const parts = request.split(" "); const patch = {}; ((state.logic && state.logic.fields) || []).forEach((f, i) => (patch[f.name] = parts[i])); setValues(patch); };
  return (
    <Card className="gap-2 py-4 animate-in fade-in-0 slide-in-from-top-1 duration-300">
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{diff.changed ? "This edit changes " + n(diff.changed) + " of " + n(diff.of) + " answers" : "This edit changes none of " + n(diff.of) + " answers"}</CardTitle>
          <Button variant="ghost" size="icon" className="size-7" aria-label="dismiss" onClick={() => { state = { ...state, diff: null }; emit(); }}><XIcon /></Button>
        </div>
      </CardHeader>
      {diff.samples.length > 0 && <CardContent className="grid gap-1 px-4">{diff.samples.map((x) => <p key={x.request} className="font-mono text-sm"><button className="underline-offset-4 hover:underline" onClick={() => show(x.request)}>{x.request}</button><span className="text-muted-foreground"> · {x.before} → </span><span className="text-brand">{x.after}</span></p>)}</CardContent>}
    </Card>
  );
}
const group = (kind) => (kind === "rule" || kind === "otherwise" ? "rules" : kind === "property" ? "guarantees" : kind);
function App() {
  const s = useSyncExternalStore(subscribe, snapshot);
  const live = useMemo(() => ({ ...evaluate(s.logic, s.values, s.table, s.logicKappa), values: s.values, trust: s.trust }), [s.logicKappa, s.values, s.table, s.trust]);
  return (
    <Live.Provider value={live}>
      {s.trust && <Badge variant={s.trust === "proved" || s.trust === "published" ? "default" : "outline"} className={cn("fixed top-3 right-3 z-10", (s.trust === "proved" || s.trust === "published") && "bg-brand text-brand-foreground", s.trust === "proving" && "animate-pulse border-brand text-brand")} aria-live="polite">{TRUST[s.trust] || s.trust}</Badge>}
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-14 pb-16">
        {s.diff && <Diff diff={s.diff} />}
        {s.nodes.length === 0
          ? <p className="pt-[30vh] text-center text-sm text-muted-foreground">The app appears here as its rules are written.</p>
          : s.nodes.map((n, i) => <Node key={n.key} node={n} pointed={s.pointed === n.key} refused={s.refused && s.refused.key === n.key ? s.refused.message : null} gap={i > 0 && group(n.kind) !== group(s.nodes[i - 1].kind) && (group(n.kind) === "rules" || group(n.kind) === "guarantees" || n.kind === "example")} />)}
      </main>
    </Live.Provider>
  );
}

// ---- the patch, and what it cost
function apply(m) {
  const t0 = performance.now();
  const before = new Map(state.nodes.map((n) => [n.key, n.kappa]));
  const sameRoot = m.root === state.root;
  const changed = sameRoot ? 0 : m.nodes.filter((n) => before.get(n.key) !== n.kappa).length + state.nodes.filter((n) => !m.nodes.some((o) => o.key === n.key)).length;
  const logicChanged = m.logicKappa !== state.logicKappa;
  document.documentElement.classList.toggle("dark", m.theme === "dark");
  renders = 0;
  flushSync(() => {
    // The diff shows for a settled edit (a user's or an agent's, or checked rules), not while a model streams.
    state = { ...state, root: m.root, nodes: sameRoot ? state.nodes : m.nodes, logic: logicChanged ? m.logic : state.logic, logicKappa: m.logicKappa, trust: m.trust || "", theme: m.theme, values: logicChanged ? defaults(m.logic, state.values) : state.values,
      diff: logicChanged ? null : state.diff, showDiff: logicChanged ? !!m.edit || (!!m.trust && m.trust !== "draft") : state.showDiff };
    emit();
  });
  if (logicChanged && m.logic && m.logic.otherwise) tableWorker().postMessage({ kappa: m.logicKappa, logic: m.logic });
  const work = Math.round((performance.now() - t0) * 10) / 10, rendered = renders;
  requestAnimationFrame(() => parent.postMessage({ type: "live/painted", app: state.app, root: m.root, changed, rendered, work, ms: Math.round((performance.now() - t0) * 10) / 10 }, "*"));
}
function hello() {
  state = { app: decodeURIComponent(location.hash.slice(1)), root: null, nodes: [], logic: null, logicKappa: null, trust: "", theme: state.theme, values: {}, table: null, diff: null };
  emit();
  parent.postMessage({ type: "live/hello", app: state.app, style: __STYLE__ }, "*");
}
addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  if (m && m.type === "live/projection" && m.app === state.app && Array.isArray(m.nodes)) apply(m);
  if (m && m.type === "live/refused" && m.app === state.app) {
    state = { ...state, refused: { key: m.key, message: m.message } }; emit();
    setTimeout(() => { if (state.refused && state.refused.message === m.message) { state = { ...state, refused: null }; emit(); } }, 6000);
  }
});
// Undo and redo move between whole specs; the host keeps the history.
addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || (e.target && e.target.tagName === "INPUT")) return;
  e.preventDefault();
  post({ type: e.shiftKey ? "live/redo" : "live/undo" });
});
addEventListener("hashchange", hello);
createRoot(document.getElementById("root")).render(<App />);
hello();
