// Development only: writes src/TelemetryProofs.lex.tex, claims.json and crates/conformance/tests/telemetry.rs. Each claim is a `breaks…`
// condition and a theorem that no input meets it, in the kernel's shape; the definitions each proof may
// unfold are listed sorted, as `linear_arithmetic` requires. Run: node studio/telemetry/tools/proofs.mjs
import { writeFileSync } from "node:fs";

const T = (n) => "Telemetry::" + n;
const sort = (xs) => [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const CLAIMS = [];
const claim = (id, statement, theorem, params, breaks, body, defs, axioms = "Quot.sound, propext") => CLAIMS.push({ id, statement, theorem, params, breaks, body, defs, axioms });

const S = "state : Telemetry::State, event : Telemetry::Event";
const O = "observation : Telemetry::Observation, stages : Telemetry::Stages";
const SW = "current : Telemetry::ModelStat, other : Telemetry::ModelStat, built : Telemetry::Observation";
const L = "loop : Telemetry::Loop, event : Nat, offered : Nat, mean : Nat, applied : Nat";
const OV = "observation : Telemetry::Observation, value : Nat, budget : Nat, over : Nat";
const LEVERS = ["leverNone", "leverWarmFrame", "leverReasoning", "leverDeclarationsFirst", "leverProjectEarly", "leverCoalesce", "leverEditPath", "leverReuseChecks", "leverShorterModule", "leverReloadTrigger"].map(T);
const KPIS = ["kpiPreview", "kpiDeclaration", "kpiPixel", "kpiUpdate", "kpiEdit", "kpiChecked", "kpiBuilt", "kpiReloads"].map(T);

claim("TL-01", "A journey's first moment, once recorded, never moves", "markNeverMoves", "current : Nat, hit : Nat, gate : Nat, at : Nat, was : Nat", "breaksMarkMoves",
  "(((current =? was) && (not (current =? 0))) && (not ((Telemetry::firstMark current hit gate at) =? was)))", [T("firstMark")], "Classical.choice, Quot.sound, propext");
claim("TL-02", "A journey's end is never recorded before its start, so no KPI span is negative", "markNeverBeforeItsStart", "current : Nat, hit : Nat, gate : Nat, at : Nat", "breaksMarkBeforeStart",
  "(((current =? 0) && (not ((Telemetry::firstMark current hit gate at) =? 0))) && ((gate =? 0) || (not (gate <=? (Telemetry::firstMark current hit gate at)))))", [T("firstMark")]);
claim("TL-03", "The worst preview update is never below an update the turn made", "worstCoversEveryUpdate", S, "breaksWorstMissesUpdate",
  "(((project event kind) =? (Telemetry::kindUpdate)) && ((Telemetry::nextUpdateWorst state event) <? (project event value)))", [T("nextUpdateWorst")]);
claim("TL-04", "The worst preview update never falls during a turn", "worstNeverFalls", S, "breaksWorstFalls",
  "((Telemetry::nextUpdateWorst state event) <? (project state updateWorst))", [T("nextUpdateWorst")]);
claim("TL-05", "An edit's time to screen is counted only from an edit that started", "editTimedFromItsEdit", S, "breaksEditWithoutStart",
  "(((Telemetry::closesEdit state event) =? 1) && ((project state editMark) =? 0))", [T("closesEdit")]);
claim("TL-06", "The worst edit to screen never falls during a turn", "editWorstNeverFalls", S, "breaksEditWorstFalls",
  "((Telemetry::nextEditWorst state event) <? (project state editWorst))", [T("nextEditWorst")]);
claim("TL-07", "A turn within budget is never counted as over", "overCountedOnlyWhenOver", OV, "breaksOverMiscounted",
  "(((((project observation over) =? over) && ((project observation kpi) <=? (Telemetry::kpiReloads))) && ((Telemetry::overCode (project observation kpi) value budget) =? 0)) && (not ((Telemetry::observeOver observation value budget) =? over)))", [T("observeOver"), T("kpiReloads")]);
claim("TL-08", "A turn over budget is always counted as over", "overCountsEveryOver", OV, "breaksOverMissed",
  "(((((project observation over) =? over) && ((project observation kpi) <=? (Telemetry::kpiReloads))) && ((Telemetry::overCode (project observation kpi) value budget) =? 1)) && (not ((Telemetry::observeOver observation value budget) =? (over + 1))))", [T("observeOver"), T("kpiReloads")]);
claim("TL-09", "The loop never suggests anything without a turn over budget", "noSuggestionWithoutOver", O, "breaksNoOver",
  "(((project observation over) =? 0) && (not ((Telemetry::lever observation stages) =? 0)))", [T("lever"), T("persistent"), T("leverNone")]);
claim("TL-10", "The loop never suggests anything unless most observed turns are over budget", "noSuggestionFromMinority", O, "breaksMinority",
  "((((project observation over) + (project observation over)) <=? (project observation turns)) && (not ((Telemetry::lever observation stages) =? 0)))", [T("lever"), T("persistent"), T("leverNone")]);
claim("TL-11", "The loop never suggests anything for a KPI with no budget", "noSuggestionWithoutBudget", O, "breaksUnbudgeted",
  "(((Telemetry::kpiReloads) <? (project observation kpi)) && (not ((Telemetry::lever observation stages) =? 0)))", [T("lever"), T("persistent"), T("largestStage"), ...KPIS, ...LEVERS]);
claim("TL-12", "A budgeted KPI over budget in most turns always gets a suggestion", "persistentOverIsSuggested", O, "breaksSilent",
  "(((Telemetry::persistent observation) && ((project observation kpi) <=? (Telemetry::kpiReloads))) && ((Telemetry::lever observation stages) =? 0))", [T("lever"), T("persistent"), T("largestStage"), ...KPIS, ...LEVERS], "Classical.choice, Quot.sound, propext");
claim("TL-13", "A time under the kernel's threshold is never judged over", "withinBudgetNeverOver", "code : Nat, value : Nat, budget : Nat", "breaksWithinTime",
  "(((not (code =? (Telemetry::kpiReloads))) && (value <? (Telemetry::budgetMicros budget))) && ((Telemetry::overCode code value budget) =? 1))", [T("overCode"), T("kpiReloads")]);
claim("TL-14", "A time at or over the kernel's threshold is never judged within", "overBudgetNeverWithin", "code : Nat, value : Nat, budget : Nat", "breaksOverTime",
  "(((not (code =? (Telemetry::kpiReloads))) && ((Telemetry::budgetMicros budget) <=? value)) && ((Telemetry::overCode code value budget) =? 0))", [T("overCode"), T("kpiReloads")]);
claim("TL-15", "The loop never suggests switching to the model already in use", "neverSwitchToCurrent", SW, "breaksSwitchSelf",
  "(((project other model) =? (project current model)) && (not ((Telemetry::switchTo current other built) =? 0)))", [T("switchTo")]);
claim("TL-16", "The loop never suggests a model switch on fewer than five reads of either model", "switchNeedsSamples", SW, "breaksSwitchSamples",
  "((((project other reads) <? 5) || ((project current reads) <? 5)) && (not ((Telemetry::switchTo current other built) =? 0)))", [T("switchTo"), T("switchSamples")]);
claim("TL-17", "The loop never suggests a model switch while Enter to Checked is within budget", "switchNeedsOver", SW, "breaksSwitchOver",
  "(((project built over) =? 0) && (not ((Telemetry::switchTo current other built) =? 0)))", [T("switchTo"), T("persistent")]);
claim("TL-18", "Only the user's approval adopts a suggestion", "onlyApprovalChangesAnything", L, "breaksAdvisory",
  "((((project loop applied) =? applied) && (not (event =? (Telemetry::loopApprove)))) && (not ((Telemetry::loopApplied loop event) =? applied)))", [T("loopApplied"), T("loopApprove")]);
claim("TL-19", "Approving with no suggestion pending adopts nothing", "approvalNeedsSuggestion", L, "breaksApproveEmpty",
  "(((((project loop applied) =? applied) && ((project loop pending) =? 0)) && (event =? (Telemetry::loopApprove))) && (not ((Telemetry::loopApplied loop event) =? applied)))", [T("loopApplied"), T("loopApprove")]);
claim("TL-20", "An adopted change is never called an improvement unless the KPI got faster", "improvedOnlyWhenFaster", "before : Nat, after : Nat", "breaksImproved",
  "((before <=? after) && ((Telemetry::assess before after) =? 1))", [T("assess")]);
claim("TL-21", "The device never keeps more than 512 turns", "keptIsBounded", "count : Nat", "breaksKept",
  "((Telemetry::keepLimit) <? (Telemetry::kept count))", [T("kept"), T("keepLimit")]);

const args = (params) => params.split(",").map((p) => p.trim().split(" ")[0]).join(" ");
let out = "\\begin{lexlean}{TelemetryProofs}\n\\useglossary{lexlean.std.bool@1.2.0}\n\\useglossary{lexlean.std.nat@1.2.0}\n\\importmodule{Telemetry}\n\\title{Boolean}\n\\begin{semanticmodule}\n";
out += CLAIMS.map((c) => `definition{
  name: ${c.breaks},
  parameters: [${c.params}],
  result: Bool,
  body: ${c.body}
}

theorem{
  name: ${c.theorem},
  parameters: [${c.params}],
  statement: ((${c.breaks} ${args(c.params)}) = false),
  proof: linear_arithmetic{definitions: [${sort([...c.defs, c.breaks]).join(", ")}]},
  axioms: [${c.axioms}]
}
`).join("\n");
out += "\\end{semanticmodule}\n\\end{lexlean}\n";
writeFileSync(new URL("../src/TelemetryProofs.lex.tex", import.meta.url), out);
writeFileSync(new URL("../claims.json", import.meta.url), JSON.stringify(CLAIMS.map(({ id, statement, theorem, breaks, body }) => ({ id, statement, theorem, breaks, body })), null, 1) + "\n");
// The conformance test pins each claim as written here (crates/conformance/tests/telemetry.rs).
const claims = CLAIMS;
writeFileSync(new URL("../../../crates/conformance/tests/telemetry.rs", import.meta.url), `//! The \`telemetry\` suite: one test per scenario in \`features/suites/telemetry.feature\`.
//!
//! The proofs are checked by the Lean kernel when the telemetry workflow runs
//! \`lexlean verify --all\` on \`studio/telemetry\` in the locked SDK. What these tests
//! hold fixed is the claim each proof is about: the condition no input may meet,
//! and the theorem that states none does. A weakened condition would still
//! verify, and would no longer be the claim its row makes.

use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

fn read(path: &str) -> String {
    std::fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))
}

/// The body of the top-level declaration named \`name\`, up to its closing brace.
fn declaration<'a>(model: &'a str, name: &str) -> &'a str {
    let start = model
        .find(&format!("\\n  name: {name},\\n"))
        .unwrap_or_else(|| panic!("{name} is not declared"));
    let end = model[start..]
        .find("\\n}\\n")
        .unwrap_or_else(|| panic!("{name} is not closed"));
    &model[start..start + end]
}

/// The condition no input may meet, the theorem that says none does, and the
/// workflow that has Lean check it.
fn pinned(breaks: &str, condition: &str, theorem: &str, statement: &str) {
    let model = read("studio/telemetry/src/TelemetryProofs.lex.tex");
    let found = declaration(&model, breaks);
    assert!(
        found.contains(condition),
        "the condition of {breaks} changed:\\n{found}"
    );
    let holds = declaration(&model, theorem);
    assert!(
        holds.contains(statement),
        "{theorem} must state that no input meets {breaks}:\\n{holds}"
    );
    let workflow = read(".github/workflows/telemetry.yml");
    assert!(
        workflow.contains("lexlean verify --all"),
        "the telemetry workflow no longer has Lean verify the model"
    );
}
` + claims.map((c) => `
/// \`${c.id}\`: ${c.statement}
#[test]
fn telemetry_${c.id.toLowerCase().replace("-", "_")}() {
    pinned(
        "${c.breaks}",
        ${JSON.stringify(c.body)},
        "${c.theorem}",
        ${JSON.stringify(`statement: ((${c.breaks} ${args(c.params)}) = false),`)},
    );
}
`).join(""));
console.log(CLAIMS.length, "claims");
