// The tab's own reading of the spec, as kernel terms. From LexLean's data form (lexlean/semantic-module/2) it writes,
// for every theorem the tab is asked about:
//   - the statement, exactly as the spec wrote it;
//   - every definition the statement reaches, as its defining equations (one per clause for structural recursion);
//   - every structure and inductive type the statement reaches, as the constructor types it must have.
// Nothing here is a proof rule. A proof made anywhere is then accepted only if the kernel accepts it against these
// terms, so a bundle cannot change what a theorem says, what a definition computes or what a type contains.
//
// The vocabulary is closed: each construct maps to one fixed term over the pinned library (Lean's Init and LexLean's
// runtime). Anything outside it is refused by name ("unsupported"), never approximated. This is a stand-in for the
// emitter requested from LexLean in UPSTREAM.md; Foundry would carry none of it.

export class Unsupported extends Error {}

// Replaces a variable by an expression in a data-form expression, stopping where a match branch binds the same name.
function substitute(e, name, by) {
  if (Array.isArray(e)) return e.map((x) => substitute(x, name, by));
  if (!e || typeof e !== "object") return e;
  if (e.kind === "var" && e.name === name) return by;
  if (e.kind === "match") {
    return { ...e, scrutinee: substitute(e.scrutinee, name, by),
      branches: e.branches.map((b) => (b.binders.includes(name) ? b : { ...b, body: substitute(b.body, name, by) })) };
  }
  const out = {};
  for (const [k, v] of Object.entries(e)) out[k] = k === "type" || k === "element" || k === "type_arguments" || k === "function" || k === "constructor" ? v : substitute(v, name, by);
  return out;
}

const L1 = { succ: 0 }; // the universe level of Type, as a level of Sort
const C = (c, us = []) => ({ c, us });
const A = (f, ...xs) => xs.reduce((g, x) => ({ a: [g, x] }), f);
const Lam = (n, ty, b) => ({ l: [n, ty, b] });
const Pi = (n, ty, b) => ({ p: [n, ty, b] });
const Nat = C("Nat"), Bool = C("Bool");

export function spec(prefix, modules) {
  return { prefix, modules };
}

export function obligations(sp, theoremNames) {
  const S = new Spec(sp);
  const theorems = [], refused = [];
  const defs = new Map(), types = new Map();
  for (const [mod, data] of Object.entries(sp.modules)) {
    for (const d of data.declarations) {
      if (d.kind !== "theorem") continue;
      const lean = S.lean(mod, d.name);
      if (theoremNames && !theoremNames.includes(lean)) continue;
      try {
        const t = S.theorem(mod, d);
        S.reach(mod, d, defs, types);
        theorems.push(t);
      } catch (e) {
        if (!(e instanceof Unsupported)) throw e;
        refused.push({ theorem: lean, reason: e.message });
      }
    }
  }
  const equations = [], inductives = [];
  for (const [lean, { mod, decl }] of defs) {
    try { equations.push(...S.equations(mod, decl)); }
    catch (e) { if (!(e instanceof Unsupported)) throw e; refused.push({ definition: lean, reason: e.message }); }
  }
  for (const [lean, { mod, decl }] of types) inductives.push(S.shape(mod, decl));
  return { theorems, equations, inductives, refused, definitions: [...defs.keys()].sort(), types: [...types.keys()].sort() };
}

class Spec {
  constructor({ prefix, modules }) { this.prefix = prefix; this.modules = modules; }
  lean(mod, name) { return `${this.prefix}.${mod}.${name}`; }
  find(mod, name) {
    const data = this.modules[mod];
    if (!data) throw new Unsupported(`module ${mod} is not in the spec`);
    const d = data.declarations.find((x) => x.name === name);
    if (!d) throw new Unsupported(`${mod}.${name} is not in the spec`);
    return d;
  }
  // Types are made absolute: a named type without a module is in the module that wrote it.
  abs(ty, mod) {
    if (!ty || typeof ty !== "object") return ty;
    if (ty.kind === "named") {
      if (ty.arguments?.length) throw new Unsupported("type arguments");
      return { kind: "named", member: { module: ty.member.module ?? mod, name: ty.member.name } };
    }
    if (ty.kind === "list") return { kind: "list", element: this.abs(ty.element, mod) };
    if (ty.kind === "option") return { kind: "option", value: this.abs(ty.value, mod) };
    if (["nat", "bool", "string", "bytes"].includes(ty.kind)) return { kind: ty.kind };
    throw new Unsupported(`type ${ty.kind}`);
  }
  ty(t) {
    switch (t.kind) {
      case "nat": return Nat;
      case "bool": return Bool;
      case "string": return C("String");
      case "bytes": return C("ByteArray");
      case "list": return A(C("List", [0]), this.ty(t.element));
      case "option": return A(C("Option", [0]), this.ty(t.value));
      case "named": return C(this.lean(t.member.module, t.member.name));
    }
    throw new Unsupported(`type ${t.kind}`);
  }
  same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  infer(e, env, mod) {
    switch (e.kind) {
      case "var": return this.lookup(env, e.name).ty;
      case "nat": return { kind: "nat" };
      case "string": return { kind: "string" };
      case "bool": return { kind: "bool" };
      case "cons": return { kind: "list", element: this.infer(e.head, env, mod) };
      case "nil": return { kind: "list", element: this.abs(e.element, mod) };
      case "record": return { kind: "named", member: { module: e.type.module ?? mod, name: e.type.name } };
      case "constructor": return this.ctorOf(e, mod).type;
      case "call": { const [fm, d] = this.callee(e, mod); return this.abs(d.result, fm); }
      case "project": return this.field(this.infer(e.value, env, mod), e.field).ty;
      case "if": return this.infer(e.then_value, env, mod);
      case "match": {
        const st = this.infer(e.scrutinee, env, mod);
        const b = e.branches[0], c = this.ctors(st).find((k) => k.ir === b.constructor.name || k.ir === this.irName(b.constructor, mod));
        if (!c) throw new Unsupported(`match on ${b.constructor.name}`);
        return this.infer(b.body, [...env, ...b.binders.map((n, i) => ({ name: n, ty: c.fields[i] }))], mod);
      }
      case "beq": case "ble": case "blt": case "and": case "or": case "not": return { kind: "bool" };
      case "add": return { kind: "nat" };
      case "primitive": return this.abs(e.result, mod);
    }
    throw new Unsupported(`expression ${e.kind}`);
  }
  lookup(env, name) {
    for (let i = env.length - 1; i >= 0; i--) if (env[i].name === name) return { ...env[i], index: env.length - 1 - i };
    throw new Unsupported(`unbound ${name}`);
  }
  callee(e, mod) { const fm = e.function.module ?? mod; return [fm, this.find(fm, e.function.name)]; }
  field(ty, name) {
    if (ty.kind !== "named") throw new Unsupported(`projection from ${ty.kind}`);
    const d = this.find(ty.member.module, ty.member.name);
    if (d.kind !== "structure") throw new Unsupported(`projection from ${d.kind}`);
    const idx = d.fields.findIndex((f) => f.name === name);
    if (idx < 0) throw new Unsupported(`no field ${name}`);
    return { idx, ty: this.abs(d.fields[idx].type, ty.member.module), struct: this.lean(ty.member.module, ty.member.name) };
  }
  irName(ctor, mod) { return `${ctor.module ?? mod}::${ctor.name}`; }
  // The constructors of a type, in declaration order, with their field types and which fields are recursive.
  ctors(st) {
    const L = (e) => ({ kind: "list", element: e });
    switch (st.kind) {
      case "list": return [
        { ir: "List.nil", lean: "List.nil", us: [0], params: [this.ty(st.element)], fields: [], recursive: [] },
        { ir: "List.cons", lean: "List.cons", us: [0], params: [this.ty(st.element)], fields: [st.element, L(st.element)], recursive: [1] }];
      case "option": return [
        { ir: "Option.none", lean: "Option.none", us: [0], params: [this.ty(st.value)], fields: [], recursive: [] },
        { ir: "Option.some", lean: "Option.some", us: [0], params: [this.ty(st.value)], fields: [st.value], recursive: [] }];
      case "nat": return [
        { ir: "Nat.zero", lean: "Nat.zero", us: [], params: [], fields: [], recursive: [] },
        { ir: "Nat.succ", lean: "Nat.succ", us: [], params: [], fields: [{ kind: "nat" }], recursive: [0] }];
      case "bool": return [
        { ir: "Bool.false", lean: "Bool.false", us: [], params: [], fields: [], recursive: [] },
        { ir: "Bool.true", lean: "Bool.true", us: [], params: [], fields: [], recursive: [] }];
      case "named": {
        const m = st.member.module, d = this.find(m, st.member.name);
        if (d.kind !== "inductive") throw new Unsupported(`match on ${d.kind}`);
        if (d.type_parameters.length || d.parameters.length) throw new Unsupported("parameters");
        return d.constructors.map((k) => {
          const fields = k.fields.map((f) => this.abs(f, m));
          return { ir: `${m}::${st.member.name}.${k.name}`, lean: this.lean(m, `${st.member.name}.${k.name}`), us: [], params: [], fields,
            recursive: fields.flatMap((f, i) => (this.same(f, st) ? [i] : [])) };
        });
      }
    }
    throw new Unsupported(`match on ${st.kind}`);
  }
  recursor(st) {
    switch (st.kind) {
      case "list": return { c: "List.rec", us: [L1, 0] };
      case "option": return { c: "Option.rec", us: [L1, 0] };
      case "nat": return { c: "Nat.rec", us: [L1] };
      case "bool": return { c: "Bool.rec", us: [L1] };
      case "named": return { c: this.lean(st.member.module, st.member.name) + ".rec", us: [L1] };
    }
  }
  ctorOf(e, mod) {
    const n = e.constructor.name;
    const targ = () => this.abs(e.type_arguments?.[0] ?? (() => { throw new Unsupported(`${n} without its type`); })(), mod);
    if (n === "Option.some" || n === "Option.none") return { type: { kind: "option", value: targ() } };
    if (n === "Nat.zero" || n === "Nat.succ") return { type: { kind: "nat" } };
    if (n === "List.nil" || n === "List.cons") return { type: { kind: "list", element: targ() } };
    const dot = n.lastIndexOf(".");
    if (dot < 0) throw new Unsupported(`constructor ${n}`);
    const m = e.constructor.module ?? mod;
    return { type: { kind: "named", member: { module: m, name: n.slice(0, dot) } } };
  }

  term(e, env, mod) {
    switch (e.kind) {
      case "var": {
        return { b: this.lookup(env, e.name).index };
      }
      case "nat": return A(C("OfNat.ofNat", [0]), Nat, { n: e.value }, A(C("instOfNatNat"), { n: e.value }));
      case "string": return { t: e.value };
      case "bool": return C(e.value ? "Bool.true" : "Bool.false");
      case "cons": return A(C("List.cons", [0]), this.ty(this.infer(e.head, env, mod)), this.term(e.head, env, mod), this.term(e.tail, env, mod));
      case "nil": return A(C("List.nil", [0]), this.ty(this.abs(e.element, mod)));
      case "record": {
        const sm = e.type.module ?? mod, d = this.find(sm, e.type.name);
        if (d.kind !== "structure" || e.fields.length !== d.fields.length) throw new Unsupported("record shape");
        const args = d.fields.map((f) => {
          const v = e.fields.find((x) => x.field === f.name);
          if (!v) throw new Unsupported(`record without ${f.name}`);
          return this.term(v.value, env, mod);
        });
        return A(C(this.lean(sm, e.type.name) + ".mk"), ...args);
      }
      case "constructor": {
        const st = this.ctorOf(e, mod).type;
        const k = this.ctors(st).find((c) => c.ir === e.constructor.name || c.ir === this.irName(e.constructor, mod));
        if (!k) throw new Unsupported(`constructor ${e.constructor.name}`);
        if (k.fields.length !== e.arguments.length) throw new Unsupported("constructor arity");
        return A(C(k.lean, k.us), ...k.params, ...e.arguments.map((x) => this.term(x, env, mod)));
      }
      case "call": {
        const [fm, d] = this.callee(e, mod);
        if (d.kind !== "definition") throw new Unsupported(`call to ${d.kind}`);
        if (d.parameters.length !== e.arguments.length) throw new Unsupported("call arity");
        return A(C(this.lean(fm, d.name)), ...e.arguments.map((x) => this.term(x, env, mod)));
      }
      case "project": {
        const f = this.field(this.infer(e.value, env, mod), e.field);
        return { j: [f.struct, f.idx, this.term(e.value, env, mod)] };
      }
      case "if": {
        const ty = this.ty(this.infer(e.then_value, env, mod)), c = this.term(e.condition, env, mod);
        return A(C("ite", [L1]), ty, A(C("Eq", [L1]), Bool, c, C("Bool.true")), A(C("instDecidableEqBool"), c, C("Bool.true")),
          this.term(e.then_value, env, mod), this.term(e.else_value, env, mod));
      }
      case "beq": case "ble": case "blt": {
        for (const s of [e.left, e.right]) if (this.infer(s, env, mod).kind !== "nat") throw new Unsupported(`${e.kind} on non-nat`);
        return A(C({ beq: "Nat.beq", ble: "Nat.ble", blt: "Nat.blt" }[e.kind]), this.term(e.left, env, mod), this.term(e.right, env, mod));
      }
      case "and": return A(C("Bool.and"), this.term(e.left, env, mod), this.term(e.right, env, mod));
      case "or": return A(C("Bool.or"), this.term(e.left, env, mod), this.term(e.right, env, mod));
      case "not": return A(C("Bool.not"), this.term(e.value ?? e.operand, env, mod));
      case "add": {
        for (const s of [e.left, e.right]) if (this.infer(s, env, mod).kind !== "nat") throw new Unsupported("add on non-nat");
        return A(C("HAdd.hAdd", [0, 0, 0]), Nat, Nat, Nat, A(C("instHAdd", [0]), Nat, C("instAddNat")), this.term(e.left, env, mod), this.term(e.right, env, mod));
      }
      case "primitive": {
        const args = e.arguments.map((x) => this.term(x, env, mod)), at = e.arguments.map((x) => this.infer(x, env, mod).kind).join(",");
        if (e.operation === "length" && at === "bytes") return A(C("LexLeanRuntime.length"), C("ByteArray"), C("LexLeanRuntime.instLengthableByteArray"), ...args);
        if (e.operation === "utf8_encode" && at === "string") return A(C("LexLeanRuntime.utf8Encode"), ...args);
        throw new Unsupported(`primitive ${e.operation}(${at})`);
      }
      case "match": {
        const st = this.infer(e.scrutinee, env, mod), R = this.infer(e, env, mod), ks = this.ctors(st), rec = this.recursor(st);
        const minors = ks.map((k) => {
          const b = e.branches.find((x) => x.constructor.name === k.ir || this.irName(x.constructor, mod) === k.ir);
          if (!b) throw new Unsupported(`match without ${k.ir}`);
          if (b.binders.length !== k.fields.length) throw new Unsupported("branch arity");
          const inner = [...env, ...b.binders.map((n, i) => ({ name: n, ty: k.fields[i] })), ...k.recursive.map(() => ({ name: "\u0000ih", ty: R }))];
          let body = this.term(b.body, inner, mod);
          for (let i = k.recursive.length - 1; i >= 0; i--) body = Lam("ih", this.ty(R), body);
          for (let i = k.fields.length - 1; i >= 0; i--) body = Lam(b.binders[i], this.ty(k.fields[i]), body);
          return body;
        });
        const motive = Lam("x", this.ty(st), this.ty(R));
        return A(C(rec.c, rec.us), ...ks[0].params, motive, ...minors, this.term(e.scrutinee, env, mod));
      }
    }
    throw new Unsupported(`expression ${e.kind}`);
  }

  // A statement over parameters: forall params, left = right.
  equality(params, left, right, mod, extraEnv = []) {
    const env = [...params.map((p) => ({ name: p.name, ty: p.ty })), ...extraEnv];
    const ty = this.infer(left, env, mod);
    const l = this.term(left, env, mod), r = this.term(right, env, mod);
    let stmt = A(C("Eq", [L1]), this.ty(ty), l, r), refl = A(C("Eq.refl", [L1]), this.ty(ty), l);
    for (let i = params.length - 1; i >= 0; i--) {
      stmt = Pi(params[i].name, this.ty(params[i].ty), stmt);
      refl = Lam(params[i].name, this.ty(params[i].ty), refl);
    }
    return { stmt, refl };
  }
  theorem(mod, d) {
    if (d.statement.kind !== "eq") throw new Unsupported(`statement ${d.statement.kind}`);
    const params = d.parameters.map((p) => ({ name: p.name, ty: this.abs(p.type, mod) }));
    const { stmt, refl } = this.equality(params, d.statement.left, d.statement.right, mod);
    return { lean: this.lean(mod, d.name), module: mod, name: d.name, stmt, refl, proof: d.proof.kind, axioms: [...d.axioms].sort() };
  }
  // Defining equations. For structural recursion, one per constructor of the recursive argument, so that each holds
  // by unfolding; together they fix the function (assumption A6 in the spec).
  //
  // Lean may recurse on a different argument than the one the spec names (firstRows: the spec matches on the count,
  // Lean's structural recursion runs on the list). An equation then holds by unfolding only once every argument of a
  // recursive type is a constructor. So a recursive definition's clauses are split further, by constructor, on every
  // parameter of a recursive type. The split is exhaustive, so the equations still say exactly what the clauses say.
  equations(mod, d) {
    const lean = this.lean(mod, d.name), params = d.parameters.map((p) => ({ name: p.name, ty: this.abs(p.type, mod) }));
    const call = { kind: "call", function: { module: mod, name: d.name }, arguments: d.parameters.map((p) => ({ kind: "var", name: p.name })) };
    const r = d.recursive_argument;
    let clauses = [{ bound: params, args: call.arguments, body: d.body }];
    if (r) {
      if (d.body.kind !== "match" || d.body.scrutinee.kind !== "var" || d.body.scrutinee.name !== r) throw new Unsupported(`${lean}: recursion not by a match on ${r}`);
      clauses = this.split(clauses, r, mod, d.body.branches);
      for (const p of params) if (p.name !== r && this.recursiveType(p.ty)) clauses = this.split(clauses, p.name, mod);
    }
    return clauses.map((c, clause) => {
      const { stmt, refl } = this.equality(c.bound, { ...call, arguments: c.args }, c.body, mod);
      return { lean, clause, of: lean, stmt, refl };
    });
  }
  recursiveType(ty) {
    try { return this.ctors(ty).some((k) => k.recursive.length > 0); } catch (e) { if (e instanceof Unsupported) return false; throw e; }
  }
  // Replaces the variable `name` by each constructor of its type. With `branches` (the definition's own match on it),
  // a clause's body is that branch's body; otherwise the body is kept and the variable substituted in it.
  split(clauses, name, mod, branches) {
    const out = [];
    for (const c of clauses) {
      const p = c.bound.find((x) => x.name === name);
      if (!p) throw new Unsupported(`split on ${name}`);
      for (const k of this.ctors(p.ty)) {
        let binders, body = c.body;
        if (branches) {
          const b = branches.find((x) => x.constructor.name === k.ir || this.irName(x.constructor, mod) === k.ir);
          if (!b) throw new Unsupported(`no clause for ${k.ir}`);
          binders = b.binders; body = b.body;
        } else binders = k.fields.map((_, i) => `${name}$${i}`);
        for (const n of binders) if (c.bound.some((x) => x.name === n && x.name !== name)) throw new Unsupported(`binder ${n} shadows a parameter`);
        const ctorExpr = {
          kind: "constructor", arguments: binders.map((n) => ({ kind: "var", name: n })),
          constructor: k.ir.includes("::") ? { module: k.ir.split("::")[0], name: k.ir.split("::")[1] } : { name: k.ir },
          type_arguments: p.ty.kind === "list" ? [p.ty.element] : p.ty.kind === "option" ? [p.ty.value] : undefined,
        };
        const at = c.bound.indexOf(p);
        out.push({
          bound: [...c.bound.slice(0, at), ...binders.map((n, i) => ({ name: n, ty: k.fields[i] })), ...c.bound.slice(at + 1)],
          args: c.args.map((x) => substitute(x, name, ctorExpr)),
          body: substitute(body, name, ctorExpr),
        });
      }
    }
    return out;
  }
  // What the kernel must have been given for a type: its constructors and their types.
  shape(mod, d) {
    const lean = this.lean(mod, d.name), self = C(lean);
    if (d.type_parameters.length || d.parameters.length) throw new Unsupported(`${lean}: parameters`);
    const ctorType = (fields) => fields.reduceRight((body, f, i) => Pi(`a${i}`, this.ty(this.abs(f, mod)), body), self);
    if (d.kind === "structure") return { lean, ctors: [{ lean: `${lean}.mk`, type: ctorType(d.fields.map((f) => f.type)) }] };
    return { lean, ctors: d.constructors.map((k) => ({ lean: `${lean}.${k.name}`, type: ctorType(k.fields) })) };
  }

  // The definitions and types a theorem reaches, through statements, bodies, fields and constructors.
  reach(mod, d, defs, types) {
    const todo = [];
    const addType = (t) => {
      if (!t || typeof t !== "object") return;
      if (t.kind === "named") {
        const lean = this.lean(t.member.module, t.member.name);
        if (types.has(lean)) return;
        const decl = this.find(t.member.module, t.member.name);
        types.set(lean, { mod: t.member.module, decl });
        for (const f of decl.fields ?? []) addType(this.abs(f.type, t.member.module));
        for (const k of decl.constructors ?? []) for (const f of k.fields) addType(this.abs(f, t.member.module));
      } else if (t.kind === "list") addType(t.element);
      else if (t.kind === "option") addType(t.value);
    };
    const walk = (x, m) => {
      if (Array.isArray(x)) return x.forEach((y) => walk(y, m));
      if (!x || typeof x !== "object") return;
      if (x.kind === "call") {
        const fm = x.function.module ?? m, lean = this.lean(fm, x.function.name);
        if (!defs.has(lean)) { const decl = this.find(fm, x.function.name); defs.set(lean, { mod: fm, decl }); todo.push([fm, decl]); }
      }
      if (x.kind === "record") addType({ kind: "named", member: { module: x.type.module ?? m, name: x.type.name } });
      if (x.kind === "constructor") addType(this.ctorOf(x, m).type);
      if (x.kind === "nil") addType(this.abs(x.element, m));
      for (const v of Object.values(x)) walk(v, m);
    };
    const visit = (m, decl) => {
      for (const p of decl.parameters ?? []) addType(this.abs(p.type, m));
      if (decl.result) addType(this.abs(decl.result, m));
      walk(decl.statement ?? decl.body, m);
    };
    visit(mod, d);
    while (todo.length) visit(...todo.pop());
  }
}
