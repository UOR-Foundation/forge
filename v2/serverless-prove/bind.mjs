// The tab's decision: is each theorem of the spec proved by this bundle, as the spec wrote it?
//
// Inputs, all bytes:
//   library  the pinned prefix: Lean's Init and LexLean's runtime library as kernel terms (lean4export), admitted by
//            its address after one full check;
//   bundle   the library followed by anything anyone produced: definitions, types and proofs (untrusted);
//   spec     LexLean's data form of the spec, which the tab computes itself.
// The tab writes its own reading of the spec (emit.mjs) as new declarations after the bundle:
//   Serverless.eqn.<definition>.<clause> : the defining equation, proved by Eq.refl in the tab;
//   Serverless.bind.<theorem>            : the spec's statement, proved by the bundle's theorem of that name, or by
//                                          Eq.refl in the tab for a reflexivity proof;
// and compares every type the spec reaches with the bundle's inductive declaration. The kernel then checks all of
// it. Nothing in the bundle is believed: a statement, definition or type that differs from the spec makes a binding
// fail, and a proof that does not prove its statement fails the kernel.

import { parse, Writer, canon, axiomsOf } from "./export.mjs";
import { obligations } from "./emit.mjs";

export const VERDICT = { proved: "proved", kernelChecked: "kernel-checked", refused: "refused", pending: "pending" };

// Builds the bytes the kernel checks and everything the host must confirm about them. No kernel runs here.
export function assemble({ library, bundle, spec, theorems, makeInTab = "reflexivity" }) {
  const fail = (code, why) => ({ ok: false, code, why });
  if (bundle.length < library.length) return fail("SP_PREFIX", "the bundle is shorter than the library");
  for (let i = 0; i < library.length; i++) if (bundle[i] !== library[i]) return fail("SP_PREFIX", `the bundle departs from the pinned library at byte ${i}`);
  const lib = parse(library);
  const ex = parse(bundle);
  const admitted = lib.order.length;
  const libraryNames = new Set(lib.order);
  const suffix = ex.order.slice(admitted);
  // A bundle may add, never replace: a name the library declares, declared again, is refused here as well as by the
  // kernel.
  for (const n of suffix) if (libraryNames.has(n)) return fail("SP_REDECLARED", `the bundle declares ${n} again`);
  for (const n of suffix) if (ex.decls.get(n).kind === "axiom") return fail("SP_AXIOM", `the bundle declares the axiom ${n}`);
  if (new Set(ex.order).size !== ex.order.length) return fail("SP_REDECLARED", "the bundle declares a name twice");

  const ob = obligations(spec, theorems);
  const w = new Writer(ex);
  const bound = new Set();
  const typeErrors = [];
  for (const t of ob.inductives) {
    const d = ex.decls.get(t.lean);
    const why = !d ? "absent" : d.kind !== "inductType" ? `a ${d.kind}` : d.record.numParams || d.record.numIndices ? "has parameters or indices"
      : d.record.isUnsafe ? "unsafe" : canon(ex, d.record.type) !== "(S (s 0))" ? "not in Type"
      : JSON.stringify(d.record.ctors.map((c) => ex.names[c])) !== JSON.stringify(t.ctors.map((c) => c.lean)) ? "other constructors" : null;
    if (why) { typeErrors.push(`${t.lean}: ${why}`); continue; }
    for (const c of t.ctors) {
      const got = ex.decls.get(c.lean);
      if (canon(ex, got.record.type) !== canon(ex, w.term(c.type))) typeErrors.push(`${c.lean}: its type is not the spec's`);
    }
    bound.add(t.lean); t.ctors.forEach((c) => bound.add(c.lean)); bound.add(`${t.lean}.rec`);
  }
  for (const d of ob.definitions) bound.add(d);

  const lines = [], records = [];
  const declare = (name, stmt, value, kind) => {
    const type = w.term(stmt), val = w.term(value), id = w.name(name);
    w.decl({ thm: { all: [id], levelParams: [], name: id, type, value: val } });
    ex.decls.set(name, { kind: "thm", record: { name: id, type, value: val } });
    records.push({ name, kind });
  };
  for (const e of ob.equations) declare(`Serverless.eqn.${e.lean}.${e.clause}`, e.stmt, e.refl, "equation");
  const theoremRows = [];
  for (const t of ob.theorems) {
    const inTab = makeInTab === "reflexivity" && t.proof === "reflexivity";
    const given = ex.decls.get(t.lean);
    if (!inTab && (!given || given.kind !== "thm")) { theoremRows.push({ theorem: t.lean, verdict: VERDICT.pending, why: "no proof in the bundle" }); continue; }
    declare(`Serverless.bind.${t.lean}`, t.stmt, inTab ? t.refl : { c: t.lean, us: [] }, inTab ? "made in tab" : "bundle");
    theoremRows.push({ theorem: t.lean, binding: `Serverless.bind.${t.lean}`, declared: t.axioms, madeInTab: inTab });
  }
  // Every constant the tab's own terms mention must come from the pinned library or be bound above. The bundle's
  // theorem used as a proof is the one exception, and it is a proof, not a meaning.
  const mentions = new Set();
  const collect = (t) => { if (!t || typeof t !== "object") return; if (t.c) mentions.add(t.c); Object.values(t).forEach((v) => Array.isArray(v) ? v.forEach(collect) : collect(v)); };
  ob.equations.forEach((e) => collect(e.stmt)); ob.theorems.forEach((t) => collect(t.stmt));
  const unbound = [...mentions].filter((c) => !libraryNames.has(c) && !bound.has(c));
  return { ok: true, ex, admitted, appended: w.text(), records, theoremRows, typeErrors, unbound, refusedByEmitter: ob.refused, obligations: ob };
}

// The verdict for each theorem, from the assembled bytes and one kernel run. `kernel(bytes, options)` returns
// nanoda's result (or Lean's, through the same interface).
export function decide(assembled, kernelResult, permitted) {
  const a = assembled;
  return a.theoremRows.map((row) => {
    if (row.verdict) return row;
    const refuse = (why) => ({ ...row, verdict: VERDICT.refused, why });
    const name = row.theorem;
    const emitterRefusal = a.refusedByEmitter.find((r) => r.theorem === name);
    if (emitterRefusal) return { ...row, verdict: VERDICT.pending, why: `not decidable in the tab: ${emitterRefusal.reason}` };
    if (a.refusedByEmitter.some((r) => r.definition)) return refuse(`a definition is outside the tab's vocabulary: ${a.refusedByEmitter.find((r) => r.definition).reason}`);
    if (a.typeErrors.length) return refuse(`types differ from the spec: ${a.typeErrors.join("; ")}`);
    if (a.unbound.length) return refuse(`the tab's terms mention unbound constants: ${a.unbound.join(", ")}`);
    if (!kernelResult.ok) return refuse(`kernel: ${kernelResult.stage}: ${String(kernelResult.refusal).slice(0, 400)}`);
    if (!kernelResult.theorems.includes(row.binding)) return refuse("the binding was not checked");
    for (const e of a.records) if (e.kind === "equation" && !kernelResult.theorems.includes(e.name)) return refuse(`${e.name} was not checked`);
    const seen = axiomsOf(a.ex, row.binding);
    // The equations need no axiom; a definition that needed one to unfold would show here.
    if (JSON.stringify(seen) !== JSON.stringify([...row.declared].sort())) return refuse(`axioms [${seen.join(", ")}], declared [${row.declared.join(", ")}]`);
    if (kernelResult.axioms_left_out?.some((x) => !permitted.includes(x))) return refuse(`axioms left out: ${kernelResult.axioms_left_out.join(", ")}`);
    return { ...row, verdict: VERDICT.kernelChecked, axioms: seen };
  });
}
