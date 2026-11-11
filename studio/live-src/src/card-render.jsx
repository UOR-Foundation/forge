// The card renderer: the view (view.jsx), rendered to markup at publish, for the app's own card on its
// published page. The page runs no React (its budget is 120 KB for everything), so every state a node can
// be in is rendered here, once, and the page picks one per node (shell/live/card-runtime.mjs keysFor).
// The states are few: a choice has its values, a rule is lit or not, the answer is the rule that decides
// or one of three cases the guest can put it in, an example passes or not and is the current request or
// not. A number typed, and a guest's answer the rules disagree with, are filled in by the page.
import { renderToStaticMarkup } from "react-dom/server";
import { Live, NodeBody, nodeProps, gapBefore, mainClass } from "./view.jsx";
import { NUMBER, ANSWER, MISMATCH, UNVERIFIED, defaults, evaluate } from "../../shell/live/card-runtime.mjs";

// The page's policy refuses style attributes; the page sets them from data-style instead.
const markup = (element) => renderToStaticMarkup(element).replace(/ style="/g, ' data-style="');
const noop = () => {};

function nodeHtml(node, gap, live) {
  return markup(<Live.Provider value={{ set: noop, ...live }}><div {...nodeProps(node, gap)}><NodeBody node={node} /></div></Live.Provider>);
}
const shell = () => {
  const [open, close] = markup(<main className={mainClass}>{"\u0000"}</main>).split("\u0000");
  return { open, close };
};

/** The screen the view draws for these values, with the interpreter as the app: what the frame shows. */
export function renderScreen(projection, values, interp) {
  const ev = evaluate(projection.logic, values, interp);
  const live = { ...ev, values, logic: projection.logic };
  const { open, close } = shell();
  return open + projection.nodes.map((n, i) => nodeHtml(n, gapBefore(projection.nodes, i), live)).join("") + close;
}

/** The card: every node with a variant for each state it can be in, and the logic the page decides by. */
export function renderCard(projection, interp) {
  const logic = projection.logic;
  if (!logic.otherwise || !logic.fields.length) throw new Error("card: an app is published with fields and an otherwise answer");
  const base = defaults(logic, {});
  const ev = evaluate(logic, base, interp);
  const rules = logic.rules.length;
  const nodes = projection.nodes.map((node, i) => {
    const gap = gapBefore(projection.nodes, i);
    const at = (live) => nodeHtml(node, gap, { ...ev, values: base, logic, ...live });
    const out = { key: node.key, kind: node.kind, variants: {} };
    if (node.kind === "input") {
      const f = node.data.field;
      out.field = f.name;
      if (f.kind === "number") { out.number = true; out.variants[""] = at({ values: { ...base, [f.name]: NUMBER } }); }
      else for (const v of f.values) out.variants[v] = at({ values: { ...base, [f.name]: v } });
    } else if (node.kind === "answer") {
      for (let k = 0; k <= rules; k++) out.variants["f" + k] = at({ answer: k < rules ? logic.rules[k].then : logic.otherwise, fires: k });
      out.variants.invalid = at({ answer: "invalid", fires: -1 });
      out.variants.mismatch = at({ answer: ANSWER, fires: -1, note: MISMATCH });
      out.variants.unverified = at({ ready: false, answer: null, fires: -1, note: UNVERIFIED });
    } else if (node.kind === "rule" || node.kind === "otherwise") {
      out.index = node.data.index;
      out.variants.on = at({ fires: node.data.index });
      out.variants.off = at({ fires: -1 });
    } else if (node.kind === "example") {
      out.request = node.data.request;
      for (const p of ["1", "0", "n"]) for (const c of ["1", "0"]) {
        out.variants[p + c] = at({ ready: p !== "n", passes: () => p === "1", request: c === "1" ? node.data.request : "" });
      }
    } else out.variants[""] = at({});
    return out;
  });
  return { logic, ...shell(), nodes };
}
