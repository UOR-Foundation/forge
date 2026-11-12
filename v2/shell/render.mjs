// Draws a PrismPM browser presentation (Foundation.View.Browser.V1.Model::Presentation, as the
// interpreter holds it) into the DOM. It knows the protocol, not the app.
//
// Covers the content kinds listed in KINDS. Any other kind is refused by name, never skipped.
import { toArray } from "./interp.mjs";

export class RenderError extends Error {
  constructor(message) { super(message); this.code = "render.unsupported"; }
}

const PREFIX = "Foundation.View.Browser.V1.Model::Content.";
const LIVE = ["off", "polite", "assertive"];

// kind -> [element for these arguments, the words it shows, properties to set]
const KINDS = {
  Section: ([label], words) => ({ tag: "section", label: words(label) }),
  Navigation: ([label], words) => ({ tag: "nav", label: words(label) }),
  Form: ([label], words) => ({ tag: "form", label: words(label) }),
  Heading: ([level, label], words) => ({ tag: "h" + level, text: words(label) }),
  Text: ([text]) => ({ tag: "p", text }),
  Action: ([label, id, enabled, isDefault], words) => ({ tag: "button", text: words(label), action: String(id), disabled: !enabled, type: isDefault ? "submit" : "button" }),
};

function describe(presentation, catalogue) {
  const words = (index) => { const w = catalogue[Number(index)]; if (w === undefined) throw new RenderError("label outside the catalogue: " + index); return w; };
  return toArray(presentation.nodes).map((node) => {
    if (!node.content.c.startsWith(PREFIX)) throw new RenderError("not a content value: " + node.content.c);
    const kind = node.content.c.slice(PREFIX.length), make = KINDS[kind];
    if (!make) throw new RenderError("content kind not drawn yet: " + kind);
    return { parent: Number(node.parent), kind, ...make(node.content.a, words) };
  });
}

// Same shape as the last frame: change only words and flags, so focus and scroll survive.
// A different shape: rebuild.
export function createView(root, onAction) {
  let shape = "", elements = [];
  root.addEventListener("submit", (e) => { e.preventDefault(); const b = e.submitter ?? e.target.querySelector("button[type=submit]"); if (b && !b.disabled) onAction(BigInt(b.dataset.action)); });
  root.addEventListener("click", (e) => { const b = e.target.closest("button[type=button][data-action]"); if (b && !b.disabled) onAction(BigInt(b.dataset.action)); });
  return function draw(presentation, catalogue) {
    const nodes = describe(presentation, catalogue);
    const next = nodes.map((n) => n.parent + n.tag).join();
    if (next !== shape) {
      root.textContent = ""; elements = [];
      for (const n of nodes) {
        const el = document.createElement(n.tag);
        (n.parent === 0 ? root : elements[n.parent - 1]).append(el);
        elements.push(el);
      }
      shape = next;
    }
    nodes.forEach((n, i) => {
      const el = elements[i];
      if (n.text !== undefined && el.textContent !== n.text) el.textContent = n.text;
      if (n.label !== undefined) el.setAttribute("aria-label", n.label);
      if (n.action !== undefined) { el.dataset.action = n.action; el.type = n.type; el.disabled = n.disabled; }
    });
    root.setAttribute("aria-live", LIVE[Number(presentation.live)] ?? "off");
  };
}
