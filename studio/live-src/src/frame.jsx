// The live frame on shadcn/ui: one React tree that draws any Prism app from its projection. Every node is
// a memoised component compared by its kappa, so a change to the spec re-renders the nodes whose kappa
// changed and leaves every other one, every typed value and the scroll position as they were. The
// components are the brand kit's vendored shadcn/ui, at the style live-src/style.json names; the answer
// comes from the interpreter every app's rule module ships (prismAnswer, prismDecide, inlined before this
// bundle from shell/prism.js). The frame is served in the preview sandbox with no network: the spec
// arrives by postMessage from the page that framed it.
/* global prismAnswer, prismDecide */
import { memo, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Badge } from "@/ui/badge";
import { cn } from "@/lib/utils";
import { Live, NodeBody, nodeProps, gapBefore, mainClass, EMPTY } from "./view.jsx";
import { defaults, evaluate } from "../../shell/live/card-runtime.mjs";

const TRUST = { draft: "Draft", drafting: "Draft", checked: "Checked", proving: "Lean is proving", proved: "Proved by Lean", published: "Proved by Lean · published" };

// ---- the store: the projection as it stands, and what the user has typed
let state = { app: "", root: null, nodes: [], logic: null, logicKappa: null, trust: "", theme: "light", values: {} };
const listeners = new Set();
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
const snapshot = () => state;
const emit = () => listeners.forEach((l) => l());
let renders = 0;
function setValues(patch) { state = { ...state, values: { ...state.values, ...patch } }; emit(); }

// ---- one node
const Node = memo(function Node({ node, gap }) {
  renders++;
  const ref = useRef(null), seen = useRef(node.kappa);
  // A node whose kappa changed (not a new one) flashes once, so the eye finds what the edit touched.
  useLayoutEffect(() => {
    if (seen.current === node.kappa || !ref.current) return;
    seen.current = node.kappa;
    ref.current.classList.remove("animate-flash"); void ref.current.offsetWidth; ref.current.classList.add("animate-flash");
  }, [node.kappa]);
  return <div ref={ref} {...nodeProps(node, gap)}><NodeBody node={node} /></div>;
}, (a, b) => a.node.kappa === b.node.kappa && a.gap === b.gap);

function App() {
  const s = useSyncExternalStore(subscribe, snapshot);
  const live = useMemo(() => ({ ...evaluate(s.logic, s.values, { prismAnswer, prismDecide }), values: s.values, logic: s.logic, set: setValues }), [s.logicKappa, s.values]);
  return (
    <Live.Provider value={live}>
      {s.trust && <Badge variant={s.trust === "proved" || s.trust === "published" ? "default" : "outline"} className={cn("fixed top-3 right-3 z-10", (s.trust === "proved" || s.trust === "published") && "bg-brand text-brand-foreground", s.trust === "proving" && "animate-pulse border-brand text-brand")} aria-live="polite">{TRUST[s.trust] || s.trust}</Badge>}
      <main className={mainClass}>
        {s.nodes.length === 0
          ? <p className="pt-[30vh] text-center text-sm text-muted-foreground">{EMPTY}</p>
          : s.nodes.map((n, i) => <Node key={n.key} node={n} gap={gapBefore(s.nodes, i)} />)}
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
    state = { ...state, root: m.root, nodes: sameRoot ? state.nodes : m.nodes, logic: logicChanged ? m.logic : state.logic, logicKappa: m.logicKappa, trust: m.trust || "", theme: m.theme, values: logicChanged ? defaults(m.logic, state.values) : state.values };
    emit();
  });
  const work = Math.round((performance.now() - t0) * 10) / 10, rendered = renders;
  requestAnimationFrame(() => parent.postMessage({ type: "live/painted", app: state.app, root: m.root, changed, rendered, work, ms: Math.round((performance.now() - t0) * 10) / 10 }, "*"));
}
function hello() {
  state = { app: decodeURIComponent(location.hash.slice(1)), root: null, nodes: [], logic: null, logicKappa: null, trust: "", theme: state.theme, values: {} };
  emit();
  parent.postMessage({ type: "live/hello", app: state.app, style: __STYLE__ }, "*");
}
addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  if (m && m.type === "live/projection" && m.app === state.app && Array.isArray(m.nodes)) apply(m);
});
addEventListener("hashchange", hello);
createRoot(document.getElementById("root")).render(<App />);
hello();
