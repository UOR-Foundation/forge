// Planted faults in a bundle: each one a bundle a dishonest or broken prover could send. The original declaration
// lines are removed and their replacements written at the end, after the terms they need.

import { parse, Writer } from "./export.mjs";

const td = new TextDecoder(), te = new TextEncoder();

// edits: [{ name, type?: term | {from: name}, value?: term | {from: name} }]
export function rewrite(bytes, edits, extra = []) {
  const text = td.decode(bytes), ex = parse(text), w = new Writer(ex);
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const drop = new Set(), out = [];
  for (const e of edits) {
    const d = ex.decls.get(e.name);
    if (!d) throw new Error(`${e.name} is not in the bundle`);
    drop.add(d.line);
    const pick = (x, field) => (x === undefined ? d.record[field] : x.from ? ex.decls.get(x.from).record[field] : w.term(x));
    const top = JSON.parse(lines[d.line]), kind = Object.keys(top)[0];
    top[kind] = { ...top[kind], type: pick(e.type, "type"), value: pick(e.value, "value") };
    out.push(top);
  }
  for (const x of extra) out.push(x(w, ex));
  const kept = lines.filter((_, i) => !drop.has(i)).join("\n");
  const tables = w.lines.length ? w.text() : "";
  return te.encode(kept + "\n" + tables + out.map((o) => JSON.stringify(o)).join("\n") + "\n");
}

const C = (c, us = []) => ({ c, us });
const A = (f, ...xs) => xs.reduce((g, x) => ({ a: [g, x] }), f);
const Lam = (n, ty, b) => ({ l: [n, ty, b] });

export const bundleFaults = {
  // clearAdvances now states and proves viewKeepsRevision: a true theorem under the wrong name. The kernel accepts the
  // bundle; only the binding to the spec's statement can refuse it.
  "statement swapped under the same name": (payment) => rewrite(payment, [{ name: "PrismTextRequest.Payment.clearAdvances", type: { from: "PrismTextRequest.Payment.viewKeepsRevision" }, value: { from: "PrismTextRequest.Payment.viewKeepsRevision" } }]),
  // clearAdvances keeps its statement and gets another theorem's proof.
  "broken proof": (payment) => rewrite(payment, [{ name: "PrismTextRequest.Payment.clearAdvances", value: { from: "PrismTextRequest.Payment.viewKeepsRevision" } }]),
  // clearAdvances closed by sorryAx: an axiom the spec does not declare.
  "proof by an undeclared axiom": (payment) => rewriteSorry(payment),
  // breaksEmpty redefined as constantly false, and emptyIgnored proved by reflexivity against that: a bundle the
  // kernel accepts, whose definition is not the spec's. The proof also mentions a library theorem that uses exactly
  // the axioms the spec declares (propext, Quot.sound), so neither the kernel nor the axiom audit can refuse it: only
  // the binding of breaksEmpty to the spec's equation can.
  "definition altered": (guests) => {
    const State = C("PrismTextRequest.App.State"), Str = C("String"), ex = parse(guests);
    const lemma = "Nat.one_and_eq_mod_two", lemmaType = ex.decls.get(lemma).record.type;
    const proof = { let: ["h", { raw: lemmaType }, C(lemma), A(C("Eq.refl", [{ succ: 0 }]), C("Bool"), C("Bool.false"))] };
    return rewrite(guests, [
      { name: "PrismTextRequest.App.breaksEmpty", value: Lam("state", State, Lam("words", Str, C("Bool.false"))) },
      { name: "PrismTextRequest.App.emptyIgnored", value: Lam("state", State, Lam("words", Str, proof)) },
    ]);
  },
  // A second declaration of a library name.
  "library name declared again": (guests) => te.encode(td.decode(guests) + JSON.stringify({ thm: { all: [nameId(guests, "Nat.beq")], levelParams: [], name: nameId(guests, "Nat.beq"), type: 0, value: 0 } }) + "\n"),
  // One byte of the pinned library changed inside the bundle.
  "library bytes altered": (guests) => { const b = new Uint8Array(guests); const i = b.indexOf(0x22, 1000); b[i + 1] ^= 1; return b; },
};

function nameId(bytes, full) { const ex = parse(bytes); return ex.names.indexOf(full); }

function rewriteSorry(payment) {
  const ex = parse(payment), name = "PrismTextRequest.Payment.clearAdvances", d = ex.decls.get(name);
  const text = td.decode(payment), w = new Writer(ex), lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const sorry = w.expr({ const: { name: w.name("sorryAx"), us: [0] } });
  const app1 = w.expr({ app: { fn: sorry, arg: d.record.type } });
  const value = w.expr({ app: { fn: app1, arg: w.term(C("Bool.false")) } });
  const top = JSON.parse(lines[d.line]);
  top.thm = { ...top.thm, value };
  return te.encode(lines.filter((_, i) => i !== d.line).join("\n") + "\n" + w.text() + JSON.stringify(top) + "\n");
}
