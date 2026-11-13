//! The `telemetry` suite: one test per scenario in `features/suites/telemetry.feature`.
//!
//! The proofs are checked by the Lean kernel when the telemetry workflow runs
//! `lexlean verify --all` on `studio/telemetry` in the locked SDK. What these tests
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

/// The body of the top-level declaration named `name`, up to its closing brace.
fn declaration<'a>(model: &'a str, name: &str) -> &'a str {
    let start = model
        .find(&format!("\n  name: {name},\n"))
        .unwrap_or_else(|| panic!("{name} is not declared"));
    let end = model[start..]
        .find("\n}\n")
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
        "the condition of {breaks} changed:\n{found}"
    );
    let holds = declaration(&model, theorem);
    assert!(
        holds.contains(statement),
        "{theorem} must state that no input meets {breaks}:\n{holds}"
    );
    let workflow = read(".github/workflows/telemetry.yml");
    assert!(
        workflow.contains("lexlean verify --all"),
        "the telemetry workflow no longer has Lean verify the model"
    );
}

/// `TL-01`: A journey's first moment, once recorded, never moves
#[test]
fn telemetry_tl_01() {
    pinned(
        "breaksMarkMoves",
        "(((current =? was) && (not (current =? 0))) && (not ((Telemetry::firstMark current hit gate at) =? was)))",
        "markNeverMoves",
        "statement: ((breaksMarkMoves current hit gate at was) = false),",
    );
}

/// `TL-02`: A journey's end is never recorded before its start, so no KPI span is negative
#[test]
fn telemetry_tl_02() {
    pinned(
        "breaksMarkBeforeStart",
        "(((current =? 0) && (not ((Telemetry::firstMark current hit gate at) =? 0))) && ((gate =? 0) || (not (gate <=? (Telemetry::firstMark current hit gate at)))))",
        "markNeverBeforeItsStart",
        "statement: ((breaksMarkBeforeStart current hit gate at) = false),",
    );
}

/// `TL-03`: The worst preview update is never below an update the turn made
#[test]
fn telemetry_tl_03() {
    pinned(
        "breaksWorstMissesUpdate",
        "(((project event kind) =? (Telemetry::kindUpdate)) && ((Telemetry::nextUpdateWorst state event) <? (project event value)))",
        "worstCoversEveryUpdate",
        "statement: ((breaksWorstMissesUpdate state event) = false),",
    );
}

/// `TL-04`: The worst preview update never falls during a turn
#[test]
fn telemetry_tl_04() {
    pinned(
        "breaksWorstFalls",
        "((Telemetry::nextUpdateWorst state event) <? (project state updateWorst))",
        "worstNeverFalls",
        "statement: ((breaksWorstFalls state event) = false),",
    );
}

/// `TL-05`: An edit's time to screen is counted only from an edit that started
#[test]
fn telemetry_tl_05() {
    pinned(
        "breaksEditWithoutStart",
        "(((Telemetry::closesEdit state event) =? 1) && ((project state editMark) =? 0))",
        "editTimedFromItsEdit",
        "statement: ((breaksEditWithoutStart state event) = false),",
    );
}

/// `TL-06`: The worst edit to screen never falls during a turn
#[test]
fn telemetry_tl_06() {
    pinned(
        "breaksEditWorstFalls",
        "((Telemetry::nextEditWorst state event) <? (project state editWorst))",
        "editWorstNeverFalls",
        "statement: ((breaksEditWorstFalls state event) = false),",
    );
}

/// `TL-07`: A turn within budget is never counted as over
#[test]
fn telemetry_tl_07() {
    pinned(
        "breaksOverMiscounted",
        "(((((project observation over) =? over) && ((project observation kpi) <=? (Telemetry::kpiReloads))) && ((Telemetry::overCode (project observation kpi) value budget) =? 0)) && (not ((Telemetry::observeOver observation value budget) =? over)))",
        "overCountedOnlyWhenOver",
        "statement: ((breaksOverMiscounted observation value budget over) = false),",
    );
}

/// `TL-08`: A turn over budget is always counted as over
#[test]
fn telemetry_tl_08() {
    pinned(
        "breaksOverMissed",
        "(((((project observation over) =? over) && ((project observation kpi) <=? (Telemetry::kpiReloads))) && ((Telemetry::overCode (project observation kpi) value budget) =? 1)) && (not ((Telemetry::observeOver observation value budget) =? (over + 1))))",
        "overCountsEveryOver",
        "statement: ((breaksOverMissed observation value budget over) = false),",
    );
}

/// `TL-09`: The loop never suggests anything without a turn over budget
#[test]
fn telemetry_tl_09() {
    pinned(
        "breaksNoOver",
        "(((project observation over) =? 0) && (not ((Telemetry::lever observation stages) =? 0)))",
        "noSuggestionWithoutOver",
        "statement: ((breaksNoOver observation stages) = false),",
    );
}

/// `TL-10`: The loop never suggests anything unless most observed turns are over budget
#[test]
fn telemetry_tl_10() {
    pinned(
        "breaksMinority",
        "((((project observation over) + (project observation over)) <=? (project observation turns)) && (not ((Telemetry::lever observation stages) =? 0)))",
        "noSuggestionFromMinority",
        "statement: ((breaksMinority observation stages) = false),",
    );
}

/// `TL-11`: The loop never suggests anything for a KPI with no budget
#[test]
fn telemetry_tl_11() {
    pinned(
        "breaksUnbudgeted",
        "(((Telemetry::kpiReloads) <? (project observation kpi)) && (not ((Telemetry::lever observation stages) =? 0)))",
        "noSuggestionWithoutBudget",
        "statement: ((breaksUnbudgeted observation stages) = false),",
    );
}

/// `TL-12`: A budgeted KPI over budget in most turns always gets a suggestion
#[test]
fn telemetry_tl_12() {
    pinned(
        "breaksSilent",
        "(((Telemetry::persistent observation) && ((project observation kpi) <=? (Telemetry::kpiReloads))) && ((Telemetry::lever observation stages) =? 0))",
        "persistentOverIsSuggested",
        "statement: ((breaksSilent observation stages) = false),",
    );
}

/// `TL-13`: A time under the kernel's threshold is never judged over
#[test]
fn telemetry_tl_13() {
    pinned(
        "breaksWithinTime",
        "(((not (code =? (Telemetry::kpiReloads))) && (value <? (Telemetry::budgetMicros budget))) && ((Telemetry::overCode code value budget) =? 1))",
        "withinBudgetNeverOver",
        "statement: ((breaksWithinTime code value budget) = false),",
    );
}

/// `TL-14`: A time at or over the kernel's threshold is never judged within
#[test]
fn telemetry_tl_14() {
    pinned(
        "breaksOverTime",
        "(((not (code =? (Telemetry::kpiReloads))) && ((Telemetry::budgetMicros budget) <=? value)) && ((Telemetry::overCode code value budget) =? 0))",
        "overBudgetNeverWithin",
        "statement: ((breaksOverTime code value budget) = false),",
    );
}

/// `TL-15`: The loop never suggests switching to the model already in use
#[test]
fn telemetry_tl_15() {
    pinned(
        "breaksSwitchSelf",
        "(((project other model) =? (project current model)) && (not ((Telemetry::switchTo current other built) =? 0)))",
        "neverSwitchToCurrent",
        "statement: ((breaksSwitchSelf current other built) = false),",
    );
}

/// `TL-16`: The loop never suggests a model switch on fewer than five reads of either model
#[test]
fn telemetry_tl_16() {
    pinned(
        "breaksSwitchSamples",
        "((((project other reads) <? 5) || ((project current reads) <? 5)) && (not ((Telemetry::switchTo current other built) =? 0)))",
        "switchNeedsSamples",
        "statement: ((breaksSwitchSamples current other built) = false),",
    );
}

/// `TL-17`: The loop never suggests a model switch while Enter to Checked is within budget
#[test]
fn telemetry_tl_17() {
    pinned(
        "breaksSwitchOver",
        "(((project built over) =? 0) && (not ((Telemetry::switchTo current other built) =? 0)))",
        "switchNeedsOver",
        "statement: ((breaksSwitchOver current other built) = false),",
    );
}

/// `TL-18`: Only the user's approval adopts a suggestion
#[test]
fn telemetry_tl_18() {
    pinned(
        "breaksAdvisory",
        "((((project loop applied) =? applied) && (not (event =? (Telemetry::loopApprove)))) && (not ((Telemetry::loopApplied loop event) =? applied)))",
        "onlyApprovalChangesAnything",
        "statement: ((breaksAdvisory loop event offered mean applied) = false),",
    );
}

/// `TL-19`: Approving with no suggestion pending adopts nothing
#[test]
fn telemetry_tl_19() {
    pinned(
        "breaksApproveEmpty",
        "(((((project loop applied) =? applied) && ((project loop pending) =? 0)) && (event =? (Telemetry::loopApprove))) && (not ((Telemetry::loopApplied loop event) =? applied)))",
        "approvalNeedsSuggestion",
        "statement: ((breaksApproveEmpty loop event offered mean applied) = false),",
    );
}

/// `TL-20`: An adopted change is never called an improvement unless the KPI got faster
#[test]
fn telemetry_tl_20() {
    pinned(
        "breaksImproved",
        "((before <=? after) && ((Telemetry::assess before after) =? 1))",
        "improvedOnlyWhenFaster",
        "statement: ((breaksImproved before after) = false),",
    );
}

/// `TL-21`: The device never keeps more than 512 turns
#[test]
fn telemetry_tl_21() {
    pinned(
        "breaksKept",
        "((Telemetry::keepLimit) <? (Telemetry::kept count))",
        "keptIsBounded",
        "statement: ((breaksKept count) = false),",
    );
}

/// `TL-22`: An app the kernel refused anything is never shown as all clear
#[test]
fn telemetry_tl_22() {
    pinned(
        "breaksRefusalHidden",
        "(((0 <? (project app blocked)) || (0 <? (project app notOpened))) && (not ((Telemetry::standing app) =? (Telemetry::standingBlocked))))",
        "refusedIsShown",
        "statement: ((breaksRefusalHidden app) = false),",
    );
}

/// `TL-23`: An app is never shown as reaching a site it was never allowed to reach
#[test]
fn telemetry_tl_23() {
    pinned(
        "breaksReachUnallowed",
        "(((project app allowed) =? 0) && ((Telemetry::standing app) =? (Telemetry::standingReaches)))",
        "reachNeedsAllowance",
        "statement: ((breaksReachUnallowed app) = false),",
    );
}

/// `TL-24`: A refused site is never shown as only allowed
#[test]
fn telemetry_tl_24() {
    pinned(
        "breaksSiteRefusalHidden",
        "((0 <? (project reach blocked)) && (not ((Telemetry::reachStanding reach) =? (Telemetry::standingBlocked))))",
        "refusedSiteIsShown",
        "statement: ((breaksSiteRefusalHidden reach) = false),",
    );
}

/// `TL-25`: A refusal is never counted as allowed, and an allowance never as a refusal
#[test]
fn telemetry_tl_25() {
    pinned(
        "breaksMiscounted",
        "((((project decision kind) =? (Telemetry::netBlocked)) && (not ((Telemetry::tally count decision (Telemetry::netAllowed)) =? count))) || (((project decision kind) =? (Telemetry::netAllowed)) && (not ((Telemetry::tally count decision (Telemetry::netBlocked)) =? count))))",
        "refusalNeverAllowed",
        "statement: ((breaksMiscounted count decision) = false),",
    );
}

/// `TL-26`: Every allowance and every refusal is counted once
#[test]
fn telemetry_tl_26() {
    pinned(
        "breaksUncounted",
        "((((project decision kind) =? (Telemetry::netAllowed)) && (not ((Telemetry::tally count decision (Telemetry::netAllowed)) =? (count + 1)))) || (((project decision kind) =? (Telemetry::netBlocked)) && (not ((Telemetry::tally count decision (Telemetry::netBlocked)) =? (count + 1)))))",
        "decisionCountedOnce",
        "statement: ((breaksUncounted count decision) = false),",
    );
}

/// `TL-27`: The time an app or a site was last seen never moves back
#[test]
fn telemetry_tl_27() {
    pinned(
        "breaksLastBack",
        "((Telemetry::latest last decision) <? last)",
        "lastNeverMovesBack",
        "statement: ((breaksLastBack last decision) = false),",
    );
}

/// `TL-28`: The device never keeps more than 256 apps
#[test]
fn telemetry_tl_28() {
    pinned(
        "breaksAppsKept",
        "((Telemetry::appKeepLimit) <? (Telemetry::appsKept count))",
        "appsKeptIsBounded",
        "statement: ((breaksAppsKept count) = false),",
    );
}
