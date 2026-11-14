// Writes an app's proof as kernel terms, with no Lean and no proof search: a suffix of the proved checker's library
// (live/build.sh) that Lean's kernel then judges.
//
// The proof is always the same two steps, for any app:
//   <app>.checked  : regionCheck B rules props d = true    := Eq.refl true
//       The kernel accepts this only by evaluating the checker on the app's own rules to `true`.
//   <app>.all_hold : every guarantee holds on every request in the bounds
//                                                           := regionCheck_sound B rules props d checked
//       regionCheck_sound is in the library, proved once for every app (studio/proof/PrismLive/Regions.lean).
// What is written here is data (the rules, the guarantees, the bounds) and those two fixed terms. If the data states
// a guarantee the rules break, the checker evaluates to `false` and the kernel refuses `checked`.
//
//   proofOf(libraryText, app) -> suffix text
//   app = { name, bounds: [[lo, hi], ...], rules: [{ when: [[field, op, value], ...], outcome }], otherwise,
//           properties: [{ always, when: [[field, op, value], ...], outcome }] }
// Operators and encoding are PrismLive.Kernel's: 0 <, 1 <=, 2 >, 3 >=, 4 =, anything else !=; a request is a list of
// numbers in field order.

/** The library, read once: its names and terms by index, and the next free index of each kind. */
export function readLibrary(text) {
  const names = [""], nameIndex = new Map([["", 0]]), exprs = [], exprIndex = new Map(), levels = new Map(), consts = new Map();
  let nextName = 1, nextExpr = 0, nextLevel = 1;
  for (const line of text.split("\n")) {
    if (!line) continue;
    const o = JSON.parse(line);
    if ("in" in o) {
      const full = "str" in o ? (names[o.str.pre] ? names[o.str.pre] + "." : "") + o.str.str : (names[o.num.pre] ? names[o.num.pre] + "." : "") + o.num.i;
      names[o.in] = full; nameIndex.set(full, o.in); nextName = Math.max(nextName, o.in + 1);
    } else if ("il" in o) {
      const { il, ...node } = o; levels.set(JSON.stringify(node), il); nextLevel = Math.max(nextLevel, il + 1);
    } else if ("ie" in o) {
      const { ie, ...node } = o; exprs[ie] = node; exprIndex.set(JSON.stringify(node), ie); nextExpr = Math.max(nextExpr, ie + 1);
    } else if ("thm" in o || "def" in o) { const d = o.thm ?? o.def; consts.set(d.name, d); }
  }
  return { names, nameIndex, exprs, exprIndex, levels, consts, nextName, nextExpr, nextLevel };
}

/**
 * One suffix per guarantee, each whole in itself: the app's rules and bounds, that one guarantee, and its two proofs.
 * regionCheck_sound holds for any list of guarantees, so it holds for a list of one. The kernel then evaluates one
 * guarantee's obligations at a time, and a guarantee's proof depends only on the rules, the bounds and itself.
 */
export function proofsOf(libraryText, spec, library = readLibrary(libraryText)) {
  return spec.properties.map((property, i) => proofOf(libraryText, { ...spec, name: spec.name + ".g" + i, properties: [property] }, library));
}

/**
 * One suffix per guarantee, proved through live/Certified.lean: the kernel subtracts, for each rule, only the earlier
 * rules the certificate names (live/certs.mjs names those whose boxes touch the region). What is named is not trusted:
 * a missing name makes `checked` false, and the kernel refuses it.
 *   <app>.checked : certCheck B rules [] d p cs co = true            := Eq.refl true
 *   <app>.holds   : every request in the bounds keeps the guarantee := certCheck_sound ... checked
 */
export function certifiedProofsOf(libraryText, spec, certs, library = readLibrary(libraryText)) {
  return spec.properties.map((property, i) => {
    const e = writer(spec.name + ".g" + i, library);
    const { define, prove, app, C, nat, list, listType, conds, pair, pairType, Nat, Bool, Rule, Property, K, one } = e;
    const listNat = listType(Nat), optionNat = app(C("Option", [0]), Nat), certType = app(C("Prod", [0, 0]), listNat, optionNat);
    const cert = (sel) => app(C("Prod.mk", [0, 0]), listNat, optionNat, list(Nat, sel.map(nat)), app(C("Option.none", [0]), Nat));
    const boxType = listType(pairType), factType = app(C("Prod", [0, 0]), boxType, listType(boxType));
    const rules = define("rules", listType(Rule), list(Rule, spec.rules.map((r) => app(C(K + "Rule.mk"), conds(r.when), nat(r.outcome)))));
    const d = define("d", Nat, nat(spec.otherwise));
    const B = define("B", boxType, list(pairType, spec.bounds.map(pair)));
    const p = define("p", Property, app(C(K + "Property.mk"), C(property.always ? "Bool.true" : "Bool.false"), conds(property.when), nat(property.outcome)));
    const cs = define("cs", listType(certType), list(certType, certs[i].rules.map(cert)));
    const co = define("co", certType, cert(certs[i].other));
    const known = app(C("List.nil", [0]), factType);
    const run = app(C(K + "certCheck"), B, rules, known, d, p, cs, co);
    const checked = prove("checked", app(C("Eq", [one]), Bool, run, C("Bool.true")), app(C("Eq.refl", [one]), Bool, C("Bool.true")));
    const sound = e.lib.consts.get(e.known(K + "certCheck_sound"));
    const args = [B, rules, known, d, p, cs, co, C(K + "allKnown_nil"), checked];
    prove("holds", instantiate(e, sound.type, args), app(C(K + "certCheck_sound"), ...args));
    return e.text();
  });
}

function writer(name, library) {
  const lib = library, out = [];
  let nextName = lib.nextName, nextExpr = lib.nextExpr, nextLevel = lib.nextLevel;
  const exprs = [], exprIndex = new Map(), ownNames = new Map(), ownLevels = new Map();
  const nodeOf = (i) => lib.exprs[i] ?? exprs[i];
  // A term is written once: one the library already holds is named by the library's index.
  const term = (node) => {
    const key = JSON.stringify(node);
    const have = lib.exprIndex.get(key) ?? exprIndex.get(key);
    if (have !== undefined) return have;
    const i = nextExpr++; exprs[i] = node; exprIndex.set(key, i); out.push(JSON.stringify({ ...node, ie: i }));
    return i;
  };
  const level = (node) => {
    const key = JSON.stringify(node);
    const have = lib.levels.get(key) ?? ownLevels.get(key);
    if (have !== undefined) return have;
    const i = nextLevel++; ownLevels.set(key, i); out.push(JSON.stringify({ il: i, ...node }));
    return i;
  };
  const known = (full) => { const i = lib.nameIndex.get(full); if (i === undefined) throw new Error("the library does not hold " + full); return i; };
  const fresh = (pre, str) => {
    const full = (pre ? (lib.names[pre] ?? [...ownNames].find(([, v]) => v === pre)[0]) + "." : "") + str;
    if (lib.nameIndex.has(full) || ownNames.has(full)) throw new Error("the name is taken: " + full);
    const i = nextName++; ownNames.set(full, i); out.push(JSON.stringify({ in: i, str: { pre, str } }));
    return i;
  };
  const one = level({ succ: 0 });
  const C = (full, us = []) => term({ const: { name: known(full), us } });
  const app = (fn, ...args) => args.reduce((f, arg) => term({ app: { arg, fn: f } }), fn);
  const nat = (n) => { if (!Number.isInteger(n) || n < 0) throw new Error("not a natural number: " + n); return term({ natVal: String(n) }); };
  const K = "PrismLive.Kernel.";
  const Nat = C("Nat"), Bool = C("Bool"), Cond = C(K + "Cond"), Rule = C(K + "Rule"), Property = C(K + "Property");
  const listType = (T) => app(C("List", [0]), T);
  const list = (T, items) => items.reduceRight((tail, head) => app(C("List.cons", [0]), T, head, tail), app(C("List.nil", [0]), T));
  const cond = ([field, op, value]) => app(C(K + "Cond.mk"), nat(field), nat(op), nat(value));
  const conds = (when) => list(Cond, when.map(cond));
  const pairType = app(C("Prod", [0, 0]), Nat, Nat);
  const pair = ([lo, hi]) => app(C("Prod.mk", [0, 0]), Nat, Nat, nat(lo), nat(hi));

  const root = name.split(".").reduce((pre, part) => fresh(pre, part), 0);
  const define = (short, type, value) => {
    const name = fresh(root, short);
    out.push(JSON.stringify({ def: { all: [name], hints: { regular: 1 }, levelParams: [], name, safety: "safe", type, value } }));
    return term({ const: { name, us: [] } });
  };
  const prove = (short, type, value) => {
    const name = fresh(root, short);
    out.push(JSON.stringify({ thm: { all: [name], levelParams: [], name, type, value } }));
    return term({ const: { name, us: [] } });
  };
  return { define, prove, app, C, nat, list, listType, conds, pair, pairType, Nat, Bool, Cond, Rule, Property, K, one, term, nodeOf, lib, known, text: () => out.join("\n") + "\n" };
}

/** The whole suffix for one app. */
export function proofOf(libraryText, spec, library = readLibrary(libraryText)) {
  const e = writer(spec.name, library);
  const { define, prove, app, C, nat, list, listType, conds, pair, pairType, Nat, Bool, Rule, Property, K, one } = e;
  const rules = define("rules", listType(Rule), list(Rule, spec.rules.map((r) => app(C(K + "Rule.mk"), conds(r.when), nat(r.outcome)))));
  const props = define("props", listType(Property), list(Property, spec.properties.map((p) => app(C(K + "Property.mk"), C(p.always ? "Bool.true" : "Bool.false"), conds(p.when), nat(p.outcome)))));
  const d = define("d", Nat, nat(spec.otherwise));
  const B = define("B", listType(pairType), list(pairType, spec.bounds.map(pair)));
  // checked : @Eq Bool (regionCheck B rules props d) true := @Eq.refl Bool true
  const run = app(C(K + "regionCheck"), B, rules, props, d);
  const checked = prove("checked", app(C("Eq", [one]), Bool, run, C("Bool.true")), app(C("Eq.refl", [one]), Bool, C("Bool.true")));
  // all_hold: regionCheck_sound applied to this app, under the type its statement takes for this app.
  const sound = e.lib.consts.get(e.known(K + "regionCheck_sound"));
  prove("all_hold", instantiate(e, sound.type, [B, rules, props, d, checked]), app(C(K + "regionCheck_sound"), B, rules, props, d, checked));
  return e.text();
}

// The body of a statement `∀ a b c ..., T` with its first binders replaced by closed terms.
function instantiate(e, type, args) {
  let body = type;
  for (let i = 0; i < args.length; i++) { const n = e.nodeOf(body); if (!n.forallE) throw new Error("the statement has fewer binders than arguments"); body = n.forallE.body; }
  const n = args.length, memo = new Map();
  const go = (i, depth) => {
    const key = i + ":" + depth;
    if (memo.has(key)) return memo.get(key);
    const node = e.nodeOf(i);
    let r;
    if ("bvar" in node) r = node.bvar < depth ? i : node.bvar - depth < n ? args[n - 1 - (node.bvar - depth)] : e.term({ bvar: node.bvar - n });
    else if (node.app) r = e.term({ app: { arg: go(node.app.arg, depth), fn: go(node.app.fn, depth) } });
    else if (node.forallE) r = e.term({ forallE: { ...node.forallE, type: go(node.forallE.type, depth), body: go(node.forallE.body, depth + 1) } });
    else if (node.lam) r = e.term({ lam: { ...node.lam, type: go(node.lam.type, depth), body: go(node.lam.body, depth + 1) } });
    else if (node.letE) r = e.term({ letE: { ...node.letE, type: go(node.letE.type, depth), value: go(node.letE.value, depth), body: go(node.letE.body, depth + 1) } });
    else if (node.proj) r = e.term({ proj: { ...node.proj, struct: go(node.proj.struct, depth) } });
    else r = i;   // a constant, a sort or a literal holds no variable
    memo.set(key, r);
    return r;
  };
  return go(body, 0);
}
