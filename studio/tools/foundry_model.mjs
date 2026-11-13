// Foundry's own facets, written by the builder's projector from what Foundry already declares.
//
// Foundry is one Prism model. Its behavior is the kernel in app/src; the other facets
// (Architecture, Design, Features, Security and its threat model, Quality, Compliance) are
// projected here by shell/prism/builder/facets.mjs, the same projector that writes the facets of
// every app the studio builds, so Foundry is checked exactly as its apps are.
//
// Nothing is restated. Each record comes from one source:
//
//   app/product.json                     who Foundry is for, its components, threats, journeys and
//                                         which kernel declarations realize each feature
//   model/ids.toml                        the register IDs each feature carries
//   app/src/ForgeKernel.lex.tex           the build phases and the rules between them (the design's
//                                         state machine), and every budget and experience rule
//                                         (quality thresholds, cited as kernel terms, not copied)
//   app/src/FoundrySpecification.lex.tex  the product obligations (compliance)
//   shell/prism/builder/assets.mjs        the shared Foundation and Production modules and the
//                                         prism.arch, prism.qual and prism.sec language packages
//
// Every declaration product.json names must exist in app/src, so a renamed theorem fails here
// before it fails the SDK.
//
//   node tools/foundry_model.mjs           write the facet modules and lexlean.toml's entrypoints
//   node tools/foundry_model.mjs --check   the Model gate: refuse any byte that differs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { facetModules } from "../shell/prism/builder/facets.mjs";
import { ASSETS } from "../shell/prism/builder/assets.mjs";
import { ISO25010, MODEL_KINDS, STRIDE, LIKELIHOOD, IMPACT, COMPONENT_KINDS, EVIDENCE_KINDS } from "../shell/prism/builder/prompt.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const app = path.join(root, "app");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

class ModelError extends Error {}
const refuse = (message) => {
  throw new ModelError(message);
};

const pascal = (s) =>
  String(s)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("") || "X";

/** Declaration names, unique within one module (the builder's rule). */
function namer() {
  const used = new Set();
  return (prefix, name) => {
    const base = `${prefix}${pascal(name)}`;
    let decl = base;
    for (let i = 2; used.has(decl); i++) decl = `${base}${i}`;
    used.add(decl);
    return decl;
  };
}

/** Index records by their position when sorted by declaration name, as the SDK numbers facet records. */
function indexed(records) {
  const sorted = [...records].sort((a, b) => (a.decl < b.decl ? -1 : a.decl > b.decl ? 1 : 0));
  sorted.forEach((r, i) => (r.index = i));
  return sorted;
}

const find = (records, key, what, field = "name") => records.find((r) => r[field] === key) ?? refuse(`\`${key}\` is not a ${what}`);

/** Every top-level declaration of the behavior modules, as Module::name. */
function behaviorDeclarations() {
  const decls = new Set();
  const theorems = new Set();
  for (const file of fs.readdirSync(path.join(app, "src"))) {
    if (!file.endsWith(".lex.tex")) continue;
    const mod = file.slice(0, -".lex.tex".length);
    const text = fs.readFileSync(path.join(app, "src", file), "utf8");
    for (const m of text.matchAll(/^(?:  name: |\w+\{name: )(\w+),/gm)) decls.add(`${mod}::${m[1]}`);
    for (const m of text.matchAll(/^theorem\{\n  name: (\w+),/gm)) theorems.add(`${mod}::${m[1]}`);
  }
  return { decls, theorems };
}

/** The kernel's named constants: `definition{name: x, parameters: [], result: Nat, body: n}`. */
function kernelConstants(kernel) {
  return Object.fromEntries([...kernel.matchAll(/^definition\{name: (\w+), parameters: \[\], result: Nat, body: (\d+)\}$/gm)].map((m) => [m[1], Number(m[2])]));
}

/** A one-parameter Nat function of the kernel as nested `if (journey =? k) then v else ...`, evaluated. */
function kernelTable(kernel, name) {
  const m = kernel.match(new RegExp(`name: ${name},\\n  parameters: \\[journey : Nat\\],\\n  result: Nat,\\n  body: (.*)\\n`));
  if (!m) refuse(`ForgeKernel declares no ${name}(journey)`);
  return Object.fromEntries([...m[1].matchAll(/\(journey =\? (\d+)\) then (\d+)/g)].map((x) => [Number(x[1]), Number(x[2])]));
}

/**
 * The build-phase rules: ruleN's body names an event and, except for the rule every phase obeys, a
 * phase; judge maps ruleN to its answer. Each becomes a transition of the design's state machine.
 */
function phaseRules(kernel, constants) {
  const body = (name) => (kernel.match(new RegExp(`name: ${name},\\n  parameters: \\[request : Request\\],\\n  result: Bool,\\n  body: (.*)\\n`)) ?? [])[1];
  const judge = (kernel.match(/name: judge,\n  parameters: \[request : Request\],\n  result: Nat,\n  body: (.*)\n/) ?? refuse("ForgeKernel declares no judge"))[1];
  const answers = Object.fromEntries([...judge.matchAll(/\(rule(\d+) request\) then \((answer\w+)\)/g)].map((m) => [Number(m[1]), m[2]]));
  const rules = [];
  for (let n = 1; body(`rule${n}`); n++) {
    const b = body(`rule${n}`);
    const event = (b.match(/\((event\w+)\)/) ?? [])[1];
    const phase = (b.match(/\((phase\w+)\)/) ?? [])[1];
    if (!event || !answers[n]) continue; // a rule that names no event keeps the phase: it is no transition
    const to = `phase${answers[n].slice("answer".length)}`;
    if (!(to in constants)) refuse(`judge answers ${answers[n]}, which names no phase`);
    rules.push({ rule: `rule${n}`, event, from: phase ?? null, to });
  }
  return rules;
}

/** The obligations FoundrySpecification declares, in constructor order, with their requirement text. */
function specificationObligations(spec) {
  const ctors = (spec.match(/name: Obligation,[\s\S]*?constructors: \[([\s\S]*?)\n  \]/) ?? refuse("FoundrySpecification declares no Obligation"))[1];
  const names = [...ctors.matchAll(/\{name: (\w+), fields: \[\]\}/g)].map((m) => m[1]);
  return names.map((name) => {
    const text = (spec.match(new RegExp(`\\| Obligation\\.${name} => "([^"]*)"`)) ?? refuse(`requirement says nothing for ${name}`))[1];
    return { name, text };
  });
}

function registerIds() {
  const ids = new Map();
  let current = null;
  for (const line of read("model/ids.toml").split("\n")) {
    const id = line.match(/^id = "([^"]+)"$/);
    if (id) ids.set((current = id[1]), {});
    const st = line.match(/^statement = "(.*)"$/);
    if (st && current) ids.get(current).statement = st[1];
  }
  return ids;
}

export function deriveFoundry() {
  const product = JSON.parse(read("app/product.json"));
  if (product.schema !== "prism/product/1") refuse("app/product.json is a prism/product/1");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(product.lastModified ?? "")) refuse("lastModified is an instant, YYYY-MM-DDThh:mm:ssZ");
  const kernel = read("app/src/ForgeKernel.lex.tex");
  const constants = kernelConstants(kernel);
  const { decls: declared, theorems } = behaviorDeclarations();
  const ids = registerIds();
  const known = (ref, what) => (declared.has(ref) ? ref : refuse(`${what} \`${ref}\` is not declared in app/src`));
  const oneOf = (v, set, what) => (set.includes(v) ? v : refuse(`${what} \`${v}\` is not one of ${set.join(", ")}`));

  // ---- Architecture -------------------------------------------------------
  const arch = namer();
  const concerns = indexed(product.concerns.map((c) => ({ ...c, model: oneOf(c.model, MODEL_KINDS, "model"), decl: arch("concern", c.name) })));
  const stakeholders = indexed(product.stakeholders.map((s) => ({ ...s, decl: arch("stakeholder", s.name) })));
  for (const s of stakeholders) for (const c of s.concerns) find(concerns, c, "concern");
  const components = indexed(product.components.map((c) => ({ ...c, kind: oneOf(c.kind, COMPONENT_KINDS, "component kind"), decl: arch("component", c.name) })));
  const comp = (key) => find(components, key, "component", "key");
  const edges = indexed(product.edges.map(([from, to]) => ({ from: comp(from), to: comp(to), kind: "dataFlow", decl: arch("edge", `${comp(from).name} to ${comp(to).name}`) })));
  const viewpoints = indexed(
    stakeholders.flatMap((s) =>
      s.concerns.map((cn) => {
        const c = find(concerns, cn, "concern");
        return { stakeholder: s, concern: c, modelKind: MODEL_KINDS.indexOf(c.model), decl: arch("viewpoint", `${s.name} ${c.name}`) };
      }),
    ),
  );
  const views = indexed(viewpoints.map((v) => ({ viewpoint: v, modelKind: v.modelKind, decl: arch("view", v.decl.slice("viewpoint".length)) })));
  const viewpointFor = (concern) => viewpoints.find((v) => v.concern.name === concern) ?? refuse(`no stakeholder holds the concern ${concern}`);

  // ---- Design -------------------------------------------------------------
  const design = namer();
  const a = (c) => `Architecture::${c.decl}`;
  const d = (decl) => `Design::${decl}`;
  const processes = product.processes.map((p) => ({ ...p, owner: comp(p.owner), decl: design("process", p.name) }));
  // Each event the kernel judges is a process of the guest: the trigger of the transitions it takes.
  for (const e of Object.keys(constants).filter((k) => k.startsWith("event"))) processes.push({ key: e, name: `On ${e.slice("event".length).toLowerCase()}`, owner: comp("kernel"), text: `The kernel judges the ${e.slice("event".length).toLowerCase()} event and answers the next phase.`, decl: design("process", `On ${e.slice("event".length)}`) });
  const proc = (name) => find(processes, name, "process");
  const eventProcess = (key) => find(processes, key, "kernel event", "key");
  const guest = comp("kernel");
  const phases = Object.keys(constants).filter((k) => k.startsWith("phase"));
  const states = phases.map((p) => ({ key: p, decl: design("state", p.slice("phase".length)), owner: guest }));
  const state = (key) => find(states, key, "phase", "key");
  const rules = phaseRules(kernel, constants);
  const vComponents = { decl: design("view", "Uml components"), title: `Components of ${product.title}`, viewpoint: viewpointFor("Integrity of published apps"), diagram: "umlComponent" };
  const vSequence = { decl: design("view", "Uml build"), title: product.sequence.title, viewpoint: viewpointFor(product.sequence.concern), diagram: "umlSequence" };
  const vPhases = { decl: design("view", "Uml phases"), title: "The build phase of an app", viewpoint: viewpointFor("Honest proof status"), diagram: "umlStateMachine" };
  const lifelineKeys = [...new Set(product.sequence.messages.flatMap(([from, to]) => [from, to]))];
  const transitionsIn = rules.flatMap((r) => {
    const trigger = eventProcess(r.event);
    const from = r.from ? [r.from] : phases; // a rule that names no phase applies in every phase
    return from.map((f) => ({ source: state(f), target: state(r.to), trigger, name: `${r.rule} from ${f.slice("phase".length)}` }));
  });
  const m = {
    title: product.title,
    lastModified: product.lastModified,
    module: [],
    design: {
      processes,
      states,
      views: [vComponents, vSequence, vPhases],
      opmThings: [],
      opmStates: [],
      opmLinks: [],
      opmZooms: [],
      umlComponents: components.map((c) => ({ decl: design("uml", c.name), view: vComponents, component: a(c) })),
      umlConnectors: edges.map((e) => ({ decl: design("uml", `${e.from.name} to ${e.to.name}`), view: vComponents, edge: a(e) })),
      lifelines: lifelineKeys.map((k, order) => ({ decl: design("seq", comp(k).name), view: vSequence, component: a(comp(k)), order })),
      messages: product.sequence.messages.map(([from, to, kind, p], order) => ({ decl: design("msg", `${order} ${p}`), view: vSequence, kind, order, source: a(comp(from)), target: a(comp(to)), process: d(proc(p).decl) })),
      umlStates: states.map((s) => ({ decl: design("st", s.key), view: vPhases, state: d(s.decl), initial: constants[s.key] === 0 })),
      transitions: transitionsIn.map((t, order) => ({ decl: design("tr", t.name), view: vPhases, order, source: t.source, target: t.target, trigger: t.trigger })),
    },
  };
  m.architecture = { stakeholders, concerns, components, edges, viewpoints, views };

  // ---- Features and journeys ---------------------------------------------
  const feat = namer();
  const modules = new Set();
  const features = product.features.map((f) => {
    for (const id of f.ids) if (!ids.has(id)) refuse(`feature ${f.name} carries ${id}, which model/ids.toml does not register`);
    const calls = f.calls.map((c) => known(c, "call"));
    const accepted = f.acceptance.map((c) => known(c, "acceptance row"));
    for (const ref of [...calls, ...accepted]) modules.add(ref.split("::")[0]);
    // A theorem accepts through a definition that names it, as the builder writes it for an app.
    const accepts = accepted.filter((ref) => theorems.has(ref)).map((ref) => ({ decl: feat("accept", ref.replace("::", " ")), target: ref }));
    const acceptance = accepted.map((ref) => (theorems.has(ref) ? `Features::${accepts.find((x) => x.target === ref).decl}` : ref));
    return { name: f.name, decl: feat("feature", f.name), statement: `${f.name} (${f.ids.join(", ")}): ${ids.get(f.ids[0]).statement}.`, calls, acceptance, accepts };
  });
  const journeys = product.journeys.map((j) => ({ decl: feat("journey", j.stakeholder), actor: find(stakeholders, j.stakeholder, "stakeholder"), steps: j.steps.map((s) => find(features, s, "feature")) }));
  m.features = { features, journeys };

  // ---- Security and threat model -----------------------------------------
  const sec = namer();
  const assets = indexed(product.assets.map((x) => ({ ...x, component: comp(x.component), decl: sec("asset", x.name) })));
  const threats = indexed(
    product.threats.map((t) => {
      const threat = { ...t, stride: oneOf(t.stride, STRIDE, "stride"), likelihood: oneOf(t.likelihood, LIKELIHOOD, "likelihood"), impact: oneOf(t.impact, IMPACT, "impact"), assetRecord: find(assets, t.asset, "asset", "key"), decl: sec("threat", t.name) };
      if (!!t.control === !!t.accepted) refuse(`threat ${t.name} has a control with evidence or an accepted risk, exactly one`);
      for (const e of t.control?.evidence ?? []) {
        oneOf(e.kind, EVIDENCE_KINDS, "evidence kind");
        if (e.kind === "proof") known(e.reference, "proof evidence");
      }
      return threat;
    }),
  );
  const risks = indexed(threats.map((t) => ({ threat: t, decl: sec("risk", t.name) })));
  const controls = indexed(risks.filter((r) => r.threat.control).map((r) => ({ risk: r, ...r.threat.control, decl: sec("control", r.threat.control.name) })));
  m.security = { assets, threats, risks, controls, controlSetText: `${product.title} asks its kernel guest before every phase change and every effect. ${product.goal}` };

  // ---- Quality (ISO/IEC 25010:2023) --------------------------------------
  // The budgets and experience rules are the kernel's own numbers: each threshold is the kernel term,
  // and its value is pinned by a theorem the Lean kernel checks.
  const budgets = { ...kernelTable(kernel, "siteBudget"), ...kernelTable(kernel, "buildBudget") };
  const [fn] = [product.budgets.function];
  known(fn, "budget function");
  const qualityIn = [
    ...product.quality,
    ...Object.entries(product.budgets.journeys).map(([journey, measure]) => {
      if (!(journey in constants)) refuse(`ForgeKernel declares no ${journey}`);
      const value = budgets[constants[journey]] ?? refuse(`${fn} has no budget for ${journey}`);
      return { characteristic: product.budgets.characteristic, subcharacteristic: product.budgets.subcharacteristic, requirement: `Budget ${journey.slice("journey".length)}`, text: `${measure.split(",")[0]} stays within the kernel's budget.`, measure, measureText: `${measure}, measured by the gate that asks the kernel.`, threshold: value, thresholdTerm: `(${fn} (ForgeKernel::${journey}))` };
    }),
    ...Object.entries(product.rules.constants).map(([name, [sub, requirement, measure]]) => {
      if (!(name in constants)) refuse(`ForgeKernel declares no ${name}`);
      return { characteristic: product.rules.characteristic, subcharacteristic: sub, requirement, text: `${measure.split(",")[0]}, as the kernel decides it.`, measure, measureText: `${measure}.`, threshold: constants[name], thresholdTerm: `(ForgeKernel::${name})` };
    }),
  ];
  const qual = namer();
  for (const q of qualityIn) oneOf(q.subcharacteristic, ISO25010[oneOf(q.characteristic, Object.keys(ISO25010), "characteristic")], `subcharacteristic of ${q.characteristic}`);
  const characteristics = indexed([...new Set(qualityIn.map((q) => q.characteristic))].map((c) => ({ name: c, decl: qual("characteristic", c), text: `${c}, as ISO/IEC 25010:2023 defines it, for ${product.title}.` })));
  const subcharacteristics = indexed([...new Map(qualityIn.map((q) => [q.subcharacteristic, q.characteristic])).entries()].map(([s, c]) => ({ name: s, characteristic: find(characteristics, c, "characteristic"), decl: qual("subcharacteristic", s), text: `${c}: ${s}.` })));
  const requirements = indexed(qualityIn.map((q) => ({ name: q.requirement, text: q.text, subcharacteristic: find(subcharacteristics, q.subcharacteristic, "subcharacteristic"), decl: qual("requirement", q.requirement), row: q })));
  const measures = indexed(requirements.map((r) => ({ name: r.row.measure, text: r.row.measureText, threshold: r.row.threshold, thresholdTerm: r.row.thresholdTerm, requirement: r, decl: qual("measure", r.row.measure) })));
  m.quality = { characteristics, subcharacteristics, requirements, measures, imports: ["ForgeKernel"] };

  // ---- Compliance --------------------------------------------------------
  const obligations = specificationObligations(read("app/src/FoundrySpecification.lex.tex"));
  m.compliance = [
    { standard: "ISO/IEC/IEEE 42010:2022", subject: "Architecture description", text: "Stakeholders, concerns, viewpoints and views are declared and their references resolve.", evidence: ["Architecture::architectureDescriptionHolds"] },
    { standard: "OMG UML 2.5.1", subject: "Design views", text: "Every design view is checked by the SDK against the system model; the build-phase machine is the kernel's own rules.", evidence: m.design.views.map((v) => d(v.decl)) },
    { standard: "ISO/IEC 25010:2023", subject: "Product quality", text: "Every budget and experience rule of the kernel is a quality measure whose threshold is the kernel's term.", evidence: ["Quality::qualityModelHolds"] },
    { standard: "ISO/IEC 27034-1:2011 and ISO/IEC 27005:2022", subject: "Application security and risk", text: "Every threat has a STRIDE category and a mapped control with evidence, or an accepted risk with its rationale.", evidence: ["Security::controlSet"] },
    ...obligations.map((o) => ({ standard: "Prism AI Foundry specification", subject: o.name, text: o.text, evidence: ["FoundrySpecification::requirement"] })),
    { standard: `SPDX ${product.license}`, subject: "Licensing", text: `Foundry and its model are offered under ${product.license}.`, evidence: ["ForgeKernel::application"] },
  ];
  modules.add("FoundrySpecification");
  modules.add("ForgeKernel");
  m.module = [...modules].sort();
  return m;
}

/** Every file the model owns under app/, by path from app/. */
export function foundryFiles() {
  const m = deriveFoundry();
  // The Foundation and Production modules and language packages every Prism app carries are the
  // builder's, so Foundry and the apps it builds are checked against the same ones.
  const files = { ...ASSETS };
  const modules = facetModules(m);
  Object.assign(files, modules);
  const toml = fs.readFileSync(path.join(app, "lexlean.toml"), "utf8");
  const facets = Object.keys(modules).sort();
  const behavior = ["src/ForgeKernel.lex.tex", "src/ForgeKernelProofs.lex.tex"];
  const entry = `entrypoints = [${[...behavior, ...facets].sort().map((e) => `"${e}"`).join(", ")}]`;
  files["lexlean.toml"] = toml.replace(/^entrypoints = \[.*\]$/m, entry);
  return files;
}

function main() {
  const check = process.argv.includes("--check");
  let files;
  try {
    files = foundryFiles();
  } catch (e) {
    if (e instanceof ModelError) {
      console.error(`foundry model: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
  const stale = [];
  for (const [p, text] of Object.entries(files)) {
    const target = path.join(app, p);
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    if (current === text) continue;
    if (check) stale.push(`app/${p}`);
    else fs.writeFileSync(target, text);
  }
  if (check && stale.length) {
    console.error(`foundry model: ${stale.join(", ")} differ from what app/product.json and app/src project; run node studio/tools/foundry_model.mjs`);
    process.exit(1);
  }
  console.log(check ? "foundry model: every facet is what the model projects" : `foundry model: wrote ${Object.keys(files).length} files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
