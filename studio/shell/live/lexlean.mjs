// The canonical source of a Prism app: one LexLean semantic module. Ported from the Prism Live spike;
// the live preview projects from what this reads (project.mjs), so LexLean is the source and the
// spec is a view of it.
//
// The canonical source of a Prism app: one LexLean semantic module.
//
// It holds the meaning and nothing else: choice and answer codes, the Request structure, its
// bounds (`inBounds`), the rules, the first-match `judge`, and each property as a `breaks…`
// definition with the theorem that it never holds. The text application around it (byte parsing,
// dispatch, acceptance vectors) is derived from it, as prism-code derives it.
//
// `readLexLean` turns that module into the kernel's model. `toLexLean` writes the module in
// prism-code's layout. `readLexLean(toLexLean(s))` reproduces `s`, and `toLexLean(readLexLean(t))`
// reproduces `t` for a canonical `t`; both are tested.
import { names, declarations, proofDeclarations, declarationText } from "../prism/render.mjs";

// prism-code's renderer names bytes in hex through Node's Buffer; the browser has none.
if (!globalThis.Buffer) globalThis.Buffer = { from: (bytes) => ({ toString: () => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") }) };

const kebab = (pascal) => pascal.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
const pascalOf = (word) => word.split(/[^a-z0-9]+/i).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");

// ---- writing

const boundsTerms = (spec, n) => spec.fields.flatMap((f) => {
  const left = `(project request ${n.fields[f.name].id})`;
  return [
    ...(f.kind === "choice" ? [`(${left} <? ${f.values.length})`] : []),
    ...(f.kind === "number" && (f.min ?? 0) > 0 ? [`(${f.min} <=? ${left})`] : []),
    ...(f.kind === "number" ? [`(${left} <=? ${f.max})`] : []),
  ];
});
const conj = (terms) => terms.reduce((acc, t) => (acc ? `(${acc} && ${t})` : t), "");

export function toLexLean(input) {
  // Rules and guarantees a person or model wrote may carry no id yet: number them as prism-code does.
  const pad = (i) => String(i + 1).padStart(3, "0");
  const spec = { ...input, purpose: input.purpose ?? input.title ?? "", examples: input.examples || [], rules: (input.rules || []).map((r, i) => ({ id: `REQ-${pad(i)}`, ...r })), properties: (input.properties || []).map((p, i) => ({ id: `INV-${pad(i)}`, ...p })) };
  const n = names(spec);
  const keep = new Set(["Request", "judge", ...Object.values(n.rules), ...Object.values(n.answers), ...Object.values(n.fields).flatMap((f) => Object.values(f.choices))]);
  const decls = declarations(spec, n).filter((d) => keep.has(d.name)).map(declarationText);
  const at = decls.findIndex((t) => t.startsWith("structure{"));
  decls.splice(at + 1, 0, `definition{\n  name: inBounds,\n  parameters: [request : Request],\n  result: Bool,\n  body: ${conj(boundsTerms(spec, n))}\n}`);
  // Without the module qualifier the proof's definition list must be re-sorted: LexLean requires
  // it sorted and unique.
  const proofs = proofDeclarations(spec, n).map(declarationText).map((t) => t.replaceAll(`${n.module}::`, ""))
    .map((t) => t.replace(/(definitions: \[\n)([\s\S]*?)(\n\s*\])/, (_, a, list, b) => {
      const items = [...new Set(list.split(",").map((x) => x.trim()).filter(Boolean))].sort();
      const indent = /^(\s*)/.exec(list)[1];
      return a + items.map((x) => indent + x).join(",\n") + b;
    }));
  return [
    `\\begin{lexlean}{${n.module}}`,
    "\\useglossary{lexlean.std.bool@1.2.0}",
    "\\useglossary{lexlean.std.nat@1.2.0}",
    "\\useglossary{prism.arch@1.0.0}",
    // A LexLean title is a lexicon phrase, not free text: the app is named by its module.
    "\\title{Text application model}",
    "\\begin{semanticmodule}",
    [...decls, ...proofs].join("\n\n"),
    "\\end{semanticmodule}",
    "\\end{lexlean}",
    "",
  ].join("\n");
}

// ---- reading

export class LexLeanError extends Error {
  constructor(message, where) { super(where ? `${where}: ${message}` : message); this.where = where; }
}

function blocks(text) {
  const out = [];
  const re = /(definition|structure|theorem)\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index + m[1].length;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) break;
    }
    if (depth !== 0) throw new LexLeanError("unclosed block", m[1]);
    const body = text.slice(m.index + m[1].length + 1, i);
    const name = /^\s*name:\s*([A-Za-z_][\w]*)/.exec(body)?.[1];
    if (!name) throw new LexLeanError(`a ${m[1]} has no name`);
    out.push({ kind: m[1], name, body, start: m.index, end: i + 1 });
    re.lastIndex = i + 1;
  }
  return out;
}

const TOKEN = /\s*(<=\?|<\?|=\?|&&|\|\||\(|\)|[A-Za-z_][\w.:]*|\d+)/y;
function tokens(src, where) {
  const out = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new LexLeanError(`cannot read "${src.slice(pos, pos + 24).trim()}"`, where);
    out.push(m[1]);
    pos = TOKEN.lastIndex;
  }
  return out;
}

const BIN = new Set(["=?", "<?", "<=?", "&&", "||"]);
function parseExpr(src, where) {
  const t = tokens(src, where);
  let i = 0;
  const peek = () => t[i], next = () => t[i++];
  const expect = (x) => { if (next() !== x) throw new LexLeanError(`expected "${x}"`, where); };
  function primary() {
    const k = next();
    if (k === "(") { const e = inner(); expect(")"); return e; }
    if (k === undefined) throw new LexLeanError("unexpected end", where);
    if (/^\d+$/.test(k)) return { num: Number(k) };
    if (k === ")" || BIN.has(k)) throw new LexLeanError(`unexpected "${k}"`, where);
    return { id: k };
  }
  function inner() {
    if (peek() === "not") { next(); return { not: primary() }; }
    if (peek() === "if") { next(); const c = primary(); expect("then"); const a = primary(); expect("else"); return { if: c, then: a, else: primary() }; }
    if (peek() === "project") { next(); const rec = next(); const field = next(); return { project: field, of: rec }; }
    let left = primary();
    if (left.id && peek() !== ")" && !BIN.has(peek())) { const args = []; while (peek() !== ")" && !BIN.has(peek())) args.push(primary()); left = { app: left.id, args }; }
    while (BIN.has(peek())) { const op = next(); left = { op, left, right: primary() }; }
    return left;
  }
  const e = primary();
  if (i !== t.length) throw new LexLeanError(`unexpected "${t[i]}"`, where);
  return e;
}

const flatAnd = (e) => (e.op === "&&" ? [...flatAnd(e.left), ...flatAnd(e.right)] : [e]);
const field = (e) => e.project ?? null;

const invalidModule = () => Object.assign(new Error("The canonical decision module is invalid or unsupported"), { code: "invalidCanonicalModule" });
const compact = text => text.replace(/\s+/g, "");
function signature(text, declarations) {
  const semantic = declarations.filter(d => d.kind !== "theorem").map(d => compact(text.slice(d.start, d.end))).sort();
  let outside = "", cursor = 0;
  for (const d of declarations) { outside += text.slice(cursor, d.start); cursor = d.end; }
  outside += text.slice(cursor);
  return JSON.stringify([compact(outside), semantic]);
}
// This reader admits the canonical decision profile, not arbitrary LexLean programs.
// Reconstructing every declaration prevents an unsupported constraint from disappearing.
export function readLexLean(text) {
  try {
    if (typeof text !== "string" || text.length > 1024 * 1024 || new TextEncoder().encode(text).length > 1024 * 1024) throw invalidModule();
    const delimiters = [];
    for (const char of text) {
      if (char === "(" || char === "{") { delimiters.push(char); if (delimiters.length > 256) throw invalidModule(); }
      else if (char === ")" || char === "}") { if (delimiters.pop() !== (char === ")" ? "(" : "{")) throw invalidModule(); }
    }
    if (delimiters.length) throw invalidModule();
    const declared = blocks(text);
    if (declared.length > 4096 || new Set(declared.map(d => d.name)).size !== declared.length) throw invalidModule();
    const spec = readDecisionModule(text), canonical = toLexLean(spec);
    if (signature(text, declared) !== signature(canonical, blocks(canonical))) throw invalidModule();
    return spec;
  } catch { throw invalidModule(); }
}

function readDecisionModule(text) {
  const header = /\\begin\{lexlean\}\{([A-Za-z_]\w*)\}/.exec(text);
  if (!header) throw new LexLeanError("no \\begin{lexlean}{Module}");
  if (!/\\end\{lexlean\}/.test(text)) throw new LexLeanError("no \\end{lexlean}");
  const title = header[1].replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const bs = blocks(text);
  const byName = new Map(bs.map((b) => [b.name, b]));
  const bodyOf = (b) => { const m = /\bbody:\s*/.exec(b.body); if (!m) throw new LexLeanError("no body", b.name); return b.body.slice(m.index + m[0].length).replace(/,\s*(axioms|recursive_argument):[\s\S]*$/, "").trim(); };

  const req = bs.find((b) => b.kind === "structure" && b.name === "Request");
  if (!req) throw new LexLeanError("no structure Request");
  const fieldIds = [...req.body.matchAll(/\{name:\s*(\w+),\s*type:\s*Nat\}/g)].map((m) => m[1]);
  if (!fieldIds.length) throw new LexLeanError("Request has no Nat fields", "Request");

  // Codes: `<field><Value>` for choices, `answer<Word>` for answers, each a Nat literal.
  const consts = new Map();
  for (const b of bs) {
    if (b.kind !== "definition" || !/parameters:\s*\[\s*\]/.test(b.body) || !/result:\s*Nat/.test(b.body)) continue;
    const v = /^\d+$/.exec(bodyOf(b)); if (v) consts.set(b.name, Number(v[0]));
  }
  const choices = {}, constOf = new Map();
  for (const fid of fieldIds) {
    const own = [...consts].filter(([k]) => k.startsWith(fid) && /^[A-Z]/.test(k.slice(fid.length)) && !fieldIds.some((g) => g !== fid && g.startsWith(fid) && k.startsWith(g)));
    if (own.length) {
      own.sort((a, b) => a[1] - b[1]);
      own.forEach(([k, code], i) => { if (code !== i) throw new LexLeanError(`codes must run 0, 1, 2…; ${k} is ${code}`, k); });
      choices[fid] = own.map(([k]) => kebab(k.slice(fid.length)));
      own.forEach(([k], i) => constOf.set(k, { field: fid, value: choices[fid][i] }));
    }
  }
  const answers = [...consts].filter(([k]) => /^answer[A-Z]/.test(k)).sort((a, b) => a[1] - b[1]);
  answers.forEach(([k, code], i) => { if (code !== i) throw new LexLeanError(`answer codes must run 0, 1, 2…; ${k} is ${code}`, k); });
  const outcomes = answers.map(([k]) => kebab(k.slice(6)));
  const answerOf = (e, where) => {
    const id = e.id ?? (e.app && !e.args.length ? e.app : null);
    const i = answers.findIndex(([k]) => k === id);
    if (i < 0) throw new LexLeanError(`"${id ?? "?"}" is not an answer`, where);
    return outcomes[i];
  };

  const condition = (e, where, bound = false) => {
    const neg = !!e.not, b = e.not ?? e;
    if (!b.op || b.op === "&&" || b.op === "||") throw new LexLeanError("a condition compares a field with a value", where);
    const lf = field(b.left), rf = field(b.right);
    const val = (x) => (x.num !== undefined ? { num: x.num } : x.id && constOf.has(x.id) ? { choice: constOf.get(x.id) } : null);
    if (lf && rf) {
      // Two number fields compared: read as written, left field first. The obligations leave such a rule
      // to the table's check (it is not a box); everything else reads it as any condition.
      if (!fieldIds.includes(lf) || !fieldIds.includes(rf)) throw new LexLeanError(`unknown field ${fieldIds.includes(lf) ? rf : lf}`, where);
      if (choices[lf] || choices[rf]) throw new LexLeanError("only number fields compare with each other", where);
      const op = { "=?": "=", "<?": "<", "<=?": "<=" }[b.op];
      if (neg && op !== "=") throw new LexLeanError("only = may be negated", where);
      return { field: lf, op: neg ? "!=" : op, value: { field: rf } };
    }
    if (!lf && !rf) throw new LexLeanError("a condition must name a field", where);
    const fid = lf ?? rf, v = val(lf ? b.right : b.left);
    if (!fieldIds.includes(fid)) throw new LexLeanError(`unknown field ${fid}`, where);
    if (!v) throw new LexLeanError("unknown value", where);
    if (v.choice) {
      if (b.op !== "=?" || !lf || v.choice.field !== fid) throw new LexLeanError(`${fid} is a choice: compare it with =? and one of its codes`, where);
      return { field: fid, op: neg ? "is not" : "is", value: v.choice.value };
    }
    if (choices[fid]) {
      // A choice's only numeric condition is its bound: the code is below the number of choices.
      if (bound && lf && b.op === "<?" && !neg && v.num === choices[fid].length) return { field: fid, op: "<", value: v.num };
      throw new LexLeanError(`${fid} is a choice: compare it with one of its codes`, where);
    }
    const op = lf ? { "=?": "=", "<?": "<", "<=?": "<=" }[b.op] : { "=?": "=", "<?": ">", "<=?": ">=" }[b.op];
    if (neg) { if (op !== "=") throw new LexLeanError("only = may be negated", where); return { field: fid, op: "!=", value: v.num }; }
    return { field: fid, op, value: v.num };
  };

  // Bounds.
  const ib = byName.get("inBounds");
  if (!ib) throw new LexLeanError("no definition inBounds");
  const bounds = flatAnd(parseExpr(bodyOf(ib), "inBounds")).map((e) => condition(e, "inBounds", true));
  const fields = fieldIds.map((fid) => {
    if (choices[fid]) return { name: fid, kind: "choice", values: choices[fid] };
    const own = bounds.filter((c) => c.field === fid);
    const max = own.find((c) => c.op === "<=")?.value, min = own.find((c) => c.op === ">=")?.value ?? 0;
    if (max === undefined) throw new LexLeanError(`${fid} needs an upper bound ((project request ${fid}) <=? N)`, "inBounds");
    return { name: fid, kind: "number", min, max };
  });
  const boundKeys = new Set(bounds.map((c) => JSON.stringify(c)));

  // Rules, in the judge's order.
  const jb = byName.get("judge");
  if (!jb) throw new LexLeanError("no definition judge");
  let e = parseExpr(bodyOf(jb), "judge");
  const rules = [];
  while (e.if) {
    const r = e.if.app ?? e.if.id;
    const rb = byName.get(r);
    if (!rb) throw new LexLeanError(`no definition ${r}`, "judge");
    rules.push({ id: r, when: flatAnd(parseExpr(bodyOf(rb), r)).map((c) => condition(c, r)), then: answerOf(e.then, "judge") });
    e = e.else;
  }
  const otherwise = answerOf(e, "judge");

  // Properties: each `breaks…` definition, the requests that would break a guarantee. Its `…Holds`
  // theorem (that no request meets it) is derived, so a module the model writes need not carry it; a
  // theorem that names a breaks definition the module lacks is refused.
  const properties = [];
  for (const th of bs.filter((b) => b.kind === "theorem")) {
    const m = /statement:\s*\(\(\s*(\w+)\s+request\s*\)\s*=\s*false\s*\)/.exec(th.body);
    if (m && !byName.has(m[1])) throw new LexLeanError(`no definition ${m[1]}`, th.name);
  }
  for (const bb of bs.filter((b) => b.kind === "definition" && /^breaks[A-Z]\w*$/.test(b.name))) {
    const terms = flatAnd(parseExpr(bodyOf(bb), bb.name));
    const last = terms.pop(), neg = !!last.not, j = last.not ?? last;
    if (j.op !== "=?" || j.left.app !== "judge") throw new LexLeanError("the last term must compare (judge request) with an answer", bb.name);
    const stem = bb.name.slice(6);
    properties.push({
      id: stem[0].toLowerCase() + stem.slice(1), kind: neg ? "always" : "never", then: answerOf(j.right, bb.name),
      when: terms.map((c) => condition(c, bb.name, true)).filter((c) => !boundKeys.has(JSON.stringify(c))),
    });
  }

  return { schema: "prism/spec/1", name: kebab(header[1]), title, purpose: title, fields, outcomes, rules, otherwise, properties, examples: [] };
}

/**
 * The whole parts of a module still being written (a model streaming it). Never throws: complete
 * declarations are kept, the one being written is ignored. Returns { spec, stage, complete } where
 * stage is "empty", "fields", "rules" or "complete"; spec is a prism/spec/1 value or null.
 */
export function readLexLeanPartial(text) {
  if (typeof text !== "string" || text.length > 1024 * 1024 || new TextEncoder().encode(text).length > 1024 * 1024) {
    const error = invalidModule(); return { spec: null, stage: "empty", complete: false, code: error.code, error: error.message };
  }
  try { return { spec: readLexLean(text), stage: "complete", complete: true }; } catch (e) { /* fall through */ }
  // Close the module at the last complete declaration and read what is there.
  const ends = [];
  const re = /(definition|structure|theorem)\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index + m[1].length;
    for (; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) break; }
    if (depth !== 0) break;
    ends.push({ kind: m[1], end: i + 1, name: /name:\s*(\w+)/.exec(text.slice(m.index, i))?.[1] });
    re.lastIndex = i + 1;
  }
  const head = /\\begin\{lexlean\}\{([A-Za-z_]\w*)\}/.exec(text);
  if (!head || !ends.some((d) => d.kind === "structure")) return { spec: null, stage: "empty", complete: false };
  const body = text.slice(0, ends[ends.length - 1].end);
  const names = new Set(ends.map((d) => d.name));
  // What is missing is supplied as the least that reads: bounds from the fields, an empty judge.
  let extra = "";
  if (!names.has("inBounds")) return { spec: null, stage: "empty", complete: false };
  const answers = [...text.matchAll(/definition\{name: (answer[A-Z]\w*), parameters: \[\], result: Nat, body: (\d+)\}/g)];
  if (!names.has("judge")) {
    if (!answers.length) return { spec: null, stage: "empty", complete: false };
    extra = `\ndefinition{\n  name: judge,\n  parameters: [request : Request],\n  result: Nat,\n  body: (${answers[answers.length - 1][1]})\n}\n`;
  }
  try {
    const spec = readLexLean(body + extra + "\n\\end{semanticmodule}\n\\end{lexlean}\n");
    if (!names.has("judge")) { spec.rules = []; spec.otherwise = undefined; }
    return { spec, stage: names.has("judge") ? "rules" : "fields", complete: false };
  } catch (e) {
    return { spec: null, stage: "empty", complete: false, error: e.message };
  }
}

/** An app's canonical LexLean source, written from its spec: the module named by the app, theorems derived. */
export function canonicalSource(spec) {
  const source = toLexLean(spec);
  return { name: /\\begin\{lexlean\}\{(\w+)\}/.exec(source)[1], source };
}

/**
 * A chat turn's LexLean module: the text inside `<prism-lexlean>…</prism-lexlean>`. Returns null when
 * the turn has none, { error } when it does not read, else { name, source, spec }. The model writes the
 * declarations; the source kept is the canonical module read from them, with the theorems derived, so the
 * same meaning is always the same bytes.
 */
export function specFromTurn(text) {
  const m = /<prism-lexlean>([\s\S]*?)<\/prism-lexlean>/.exec(text || "");
  if (!m) return null;
  try {
    const spec = readLexLean(m[1].trim() + "\n");
    return { ...canonicalSource(spec), spec };
  } catch { return { code: "invalidCanonicalModule", error: "The canonical decision module is invalid or unsupported" }; }
}

/** The part of a module a turn has written so far, projected as a draft; null before there is one. */
export function partialFromTurn(text) {
  const at = (text || "").indexOf("<prism-lexlean>");
  if (at < 0) return null;
  const part = readLexLeanPartial(text.slice(at + 15).split("</prism-lexlean>")[0]);
  return part.spec ? part : null;
}
