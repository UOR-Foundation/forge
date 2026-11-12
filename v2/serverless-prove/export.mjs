// Reads lean4export NDJSON (format 3.1.0) into tables, and writes new lines that continue its numbering.
// Used by the tab to find declarations by name, compare inductive types, audit axioms, and append the declarations
// it emits. It decides nothing about typing: that is the kernel's.

const td = new TextDecoder();

export function parse(bytes) {
  const text = typeof bytes === "string" ? bytes : td.decode(bytes);
  const names = [""], levels = [{ zero: true }], exprs = [];
  const decls = new Map(); // full name -> { kind, record, line }
  const order = [];
  let meta = null, line = 0;
  for (let start = 0; start < text.length; ) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    if (end > start) {
      const o = JSON.parse(text.slice(start, end));
      if (o.in !== undefined) names[o.in] = o.str ? names[o.str.pre] ? names[o.str.pre] + "." + o.str.str : o.str.str : names[o.num.pre] + "." + o.num.i;
      else if (o.il !== undefined) levels[o.il] = o;
      else if (o.ie !== undefined) exprs[o.ie] = o;
      else if (o.meta) meta = o.meta;
      else {
        const kind = Object.keys(o)[0], rec = o[kind];
        const add = (r, k) => { const n = names[r.name]; decls.set(n, { kind: k, record: r, line, top: rec }); order.push(n); };
        if (kind === "inductive") {
          for (const t of rec.types) add(t, "inductType");
          for (const c of rec.ctors) add(c, "ctor");
          for (const r of rec.recs) add(r, "rec");
        } else add(rec, kind === "def" ? "defn" : kind);
      }
      line++;
    }
    start = end + 1;
  }
  return { meta, names, levels, exprs, decls, order, lines: line, bytes: text.length };
}

// The constants an expression refers to, directly.
export function constsOf(ex, id, out = new Set(), seen = new Set()) {
  const stack = [id];
  while (stack.length) {
    const i = stack.pop();
    if (seen.has(i)) continue;
    seen.add(i);
    const e = ex.exprs[i];
    if (!e) throw new Error(`expression ${i} is not in the export`);
    if (e.const) out.add(ex.names[e.const.name]);
    else if (e.app) stack.push(e.app.fn, e.app.arg);
    else if (e.lam) stack.push(e.lam.type, e.lam.body);
    else if (e.forallE) stack.push(e.forallE.type, e.forallE.body);
    else if (e.letE) stack.push(e.letE.type, e.letE.value, e.letE.body);
    else if (e.proj) { out.add(ex.names[e.proj.typeName]); stack.push(e.proj.struct); }
    else if (e.mdata) stack.push(e.mdata.expr);
  }
  return out;
}

// Every constant a declaration depends on, transitively, and which of them are axioms: what `#print axioms` reports.
export function axiomsOf(ex, name) {
  const seen = new Set(), axioms = new Set(), stack = [name];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    const d = ex.decls.get(n);
    if (!d) throw new Error(`${n} is not in the export`);
    if (d.kind === "axiom") axioms.add(n);
    const r = d.record, refs = new Set();
    if (r.type !== undefined) constsOf(ex, r.type, refs);
    if (r.value !== undefined) constsOf(ex, r.value, refs);
    if (d.kind === "inductType") r.ctors.forEach((c) => refs.add(ex.names[c]));
    if (d.kind === "ctor" || d.kind === "rec") (d.kind === "ctor" ? [ex.names[r.induct]] : r.all.map((a) => ex.names[a])).forEach((x) => refs.add(x));
    if (d.kind === "rec") r.rules.forEach((rule) => constsOf(ex, rule.rhs, refs));
    refs.forEach((x) => stack.push(x));
  }
  return [...axioms].sort();
}

// A canonical text of an expression with binder names and binder kinds left out: two terms that print the same are
// the same term up to alpha-equivalence. Used to compare inductive types, never to decide typing.
export function canon(ex, id, memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  const e = ex.exprs[id];
  let s;
  if (e.bvar !== undefined) s = `#${e.bvar}`;
  else if (e.sort !== undefined) s = `(S ${level(ex, e.sort)})`;
  else if (e.const) s = `(C ${ex.names[e.const.name]} ${e.const.us.map((u) => level(ex, u)).join(" ")})`;
  else if (e.app) s = `(A ${canon(ex, e.app.fn, memo)} ${canon(ex, e.app.arg, memo)})`;
  else if (e.lam) s = `(L ${canon(ex, e.lam.type, memo)} ${canon(ex, e.lam.body, memo)})`;
  else if (e.forallE) s = `(P ${canon(ex, e.forallE.type, memo)} ${canon(ex, e.forallE.body, memo)})`;
  else if (e.natVal !== undefined) s = `(N ${e.natVal})`;
  else if (e.strVal !== undefined) s = `(T ${JSON.stringify(e.strVal)})`;
  else if (e.proj) s = `(J ${ex.names[e.proj.typeName]} ${e.proj.idx} ${canon(ex, e.proj.struct, memo)})`;
  else if (e.mdata) s = canon(ex, e.mdata.expr, memo);
  else s = `(? ${JSON.stringify(e)})`;
  memo.set(id, s);
  return s;
}

export function level(ex, id) {
  const l = ex.levels[id];
  if (!l || l.zero || id === 0) return "0";
  if (l.succ !== undefined) return `(s ${level(ex, l.succ)})`;
  if (l.max) return `(max ${level(ex, l.max[0])} ${level(ex, l.max[1])})`;
  if (l.imax) return `(imax ${level(ex, l.imax[0])} ${level(ex, l.imax[1])})`;
  if (l.param !== undefined) return ex.names[l.param];
  return JSON.stringify(l);
}

// Writes new table lines after an export's own. Names, levels and expressions are shared by value with what is
// already there, so equal terms get equal numbers.
export class Writer {
  // The indexes are built once per parsed export and kept on it; rollback() removes everything this writer added,
  // so one parsed bundle serves every check of a session.
  constructor(ex) {
    this.ex = ex;
    this.lines = [];
    if (!ex.index) {
      const exprIds = new Map();
      // nanoda refuses an export that states one term twice, so a term already exported is reused, never repeated.
      ex.exprs.forEach((e, i) => { if (e) { const { ie, ...raw } = e; exprIds.set(JSON.stringify(sortKeys(raw)), i); } });
      const levelIds = new Map();
      ex.levels.forEach((l, i) => { if (l) levelIds.set(levelKey(l), i); });
      ex.index = { nameIds: new Map(ex.names.map((n, i) => [n, i]).filter(([n]) => n !== undefined)), levelIds, exprIds };
    }
    this.nameIds = ex.index.nameIds; this.levelIds = ex.index.levelIds; this.exprIds = ex.index.exprIds;
    this.base = { names: ex.names.length, levels: ex.levels.length, exprs: ex.exprs.length };
    this.nextName = ex.names.length; this.nextLevel = ex.levels.length; this.nextExpr = ex.exprs.length;
    this.added = { names: [], levels: [], exprs: [], decls: [] };
  }
  rollback() {
    for (const k of this.added.names) this.nameIds.delete(k);
    for (const k of this.added.levels) this.levelIds.delete(k);
    for (const k of this.added.exprs) this.exprIds.delete(k);
    for (const k of this.added.decls) this.ex.decls.delete(k);
    this.ex.names.length = this.base.names; this.ex.levels.length = this.base.levels; this.ex.exprs.length = this.base.exprs;
  }
  // New entries are also entered into the parsed tables, so canon() reads emitted terms as it reads exported ones.
  name(full) {
    if (this.nameIds.has(full)) return this.nameIds.get(full);
    const dot = full.lastIndexOf(".");
    const pre = dot < 0 ? 0 : this.name(full.slice(0, dot));
    const part = dot < 0 ? full : full.slice(dot + 1);
    const id = this.nextName++;
    this.lines.push(/^\d+$/.test(part) ? { in: id, num: { pre, i: Number(part) } } : { in: id, str: { pre, str: part } });
    this.nameIds.set(full, id); this.added.names.push(full);
    this.ex.names[id] = full;
    return id;
  }
  level(l) { // l: 0 | {succ: l} | {param: "u"}
    if (l === 0) return 0;
    const raw = l.succ !== undefined ? { succ: this.level(l.succ) } : { param: this.name(l.param) };
    const key = levelKey(raw);
    if (this.levelIds.has(key)) return this.levelIds.get(key);
    const id = this.nextLevel++;
    this.lines.push({ il: id, ...raw });
    this.levelIds.set(key, id); this.added.levels.push(key);
    this.ex.levels[id] = raw;
    return id;
  }
  expr(raw) {
    const key = JSON.stringify(sortKeys(raw));
    if (this.exprIds.has(key)) return this.exprIds.get(key);
    const id = this.nextExpr++;
    this.lines.push({ ie: id, ...raw });
    this.exprIds.set(key, id); this.added.exprs.push(key);
    this.ex.exprs[id] = raw;
    return id;
  }
  // A term built by emit.mjs: {b}, {s: level}, {c, us}, {a: [f, x]}, {l|p: [name, type, body]}, {n}, {t}, {j: [type, idx, e]}
  term(t) {
    if (t.b !== undefined) return this.expr({ bvar: t.b });
    if (t.s !== undefined) return this.expr({ sort: this.level(t.s) });
    if (t.c !== undefined) return this.expr({ const: { name: this.name(t.c), us: (t.us ?? []).map((u) => this.level(u)) } });
    if (t.a) return this.expr({ app: { arg: this.term(t.a[1]), fn: this.term(t.a[0]) } });
    if (t.l) return this.expr({ lam: { binderInfo: "default", body: this.term(t.l[2]), name: this.name(t.l[0]), type: this.term(t.l[1]) } });
    if (t.p) return this.expr({ forallE: { binderInfo: "default", body: this.term(t.p[2]), name: this.name(t.p[0]), type: this.term(t.p[1]) } });
    if (t.n !== undefined) return this.expr({ natVal: String(t.n) });
    if (t.t !== undefined) return this.expr({ strVal: t.t });
    if (t.j) return this.expr({ proj: { idx: t.j[1], struct: this.term(t.j[2]), typeName: this.name(t.j[0]) } });
    throw new Error(`not a term: ${JSON.stringify(t).slice(0, 200)}`);
  }
  decl(line) { this.lines.push(line); }
  text() { return this.lines.map((l) => JSON.stringify(l)).join("\n") + "\n"; }
}

function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (!x || typeof x !== "object") return x;
  return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys(x[k])]));
}

function levelKey(l) {
  if (l.zero) return "z";
  if (l.succ !== undefined) return `s${l.succ}`;
  if (l.param !== undefined) return `p${l.param}`;
  return JSON.stringify(l);
}
