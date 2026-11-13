Feature: telemetry

  Build telemetry: Forge measures each build turn on the user's device, keeps the
  records in that browser, and suggests improvements from them. Its decisions are
  the Telemetry model's (studio/telemetry/src), proved by Lean in the locked SDK
  when the telemetry workflow runs; where a record may go is the kernel's
  (FK-25 to FK-27).

  @TL-01 @build
  Scenario: A journey's first moment, once recorded, never moves
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks markNeverMoves during lexlean verify in the telemetry workflow
    Then no input meets breaksMarkMoves

  @TL-02 @build
  Scenario: A journey's end is never recorded before its start, so no KPI span is negative
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks markNeverBeforeItsStart during lexlean verify in the telemetry workflow
    Then no input meets breaksMarkBeforeStart

  @TL-03 @build
  Scenario: The worst preview update is never below an update the turn made
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks worstCoversEveryUpdate during lexlean verify in the telemetry workflow
    Then no input meets breaksWorstMissesUpdate

  @TL-04 @build
  Scenario: The worst preview update never falls during a turn
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks worstNeverFalls during lexlean verify in the telemetry workflow
    Then no input meets breaksWorstFalls

  @TL-05 @build
  Scenario: An edit's time to screen is counted only from an edit that started
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks editTimedFromItsEdit during lexlean verify in the telemetry workflow
    Then no input meets breaksEditWithoutStart

  @TL-06 @build
  Scenario: The worst edit to screen never falls during a turn
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks editWorstNeverFalls during lexlean verify in the telemetry workflow
    Then no input meets breaksEditWorstFalls

  @TL-07 @build
  Scenario: A turn within budget is never counted as over
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks overCountedOnlyWhenOver during lexlean verify in the telemetry workflow
    Then no input meets breaksOverMiscounted

  @TL-08 @build
  Scenario: A turn over budget is always counted as over
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks overCountsEveryOver during lexlean verify in the telemetry workflow
    Then no input meets breaksOverMissed

  @TL-09 @build
  Scenario: The loop never suggests anything without a turn over budget
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks noSuggestionWithoutOver during lexlean verify in the telemetry workflow
    Then no input meets breaksNoOver

  @TL-10 @build
  Scenario: The loop never suggests anything unless most observed turns are over budget
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks noSuggestionFromMinority during lexlean verify in the telemetry workflow
    Then no input meets breaksMinority

  @TL-11 @build
  Scenario: The loop never suggests anything for a KPI with no budget
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks noSuggestionWithoutBudget during lexlean verify in the telemetry workflow
    Then no input meets breaksUnbudgeted

  @TL-12 @build
  Scenario: A budgeted KPI over budget in most turns always gets a suggestion
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks persistentOverIsSuggested during lexlean verify in the telemetry workflow
    Then no input meets breaksSilent

  @TL-13 @build
  Scenario: A time under the kernel's threshold is never judged over
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks withinBudgetNeverOver during lexlean verify in the telemetry workflow
    Then no input meets breaksWithinTime

  @TL-14 @build
  Scenario: A time at or over the kernel's threshold is never judged within
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks overBudgetNeverWithin during lexlean verify in the telemetry workflow
    Then no input meets breaksOverTime

  @TL-15 @build
  Scenario: The loop never suggests switching to the model already in use
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks neverSwitchToCurrent during lexlean verify in the telemetry workflow
    Then no input meets breaksSwitchSelf

  @TL-16 @build
  Scenario: The loop never suggests a model switch on fewer than five reads of either model
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks switchNeedsSamples during lexlean verify in the telemetry workflow
    Then no input meets breaksSwitchSamples

  @TL-17 @build
  Scenario: The loop never suggests a model switch while Enter to Checked is within budget
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks switchNeedsOver during lexlean verify in the telemetry workflow
    Then no input meets breaksSwitchOver

  @TL-18 @build
  Scenario: Only the user's approval adopts a suggestion
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks onlyApprovalChangesAnything during lexlean verify in the telemetry workflow
    Then no input meets breaksAdvisory

  @TL-19 @build
  Scenario: Approving with no suggestion pending adopts nothing
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks approvalNeedsSuggestion during lexlean verify in the telemetry workflow
    Then no input meets breaksApproveEmpty

  @TL-20 @build
  Scenario: An adopted change is never called an improvement unless the KPI got faster
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks improvedOnlyWhenFaster during lexlean verify in the telemetry workflow
    Then no input meets breaksImproved

  @TL-21 @build
  Scenario: The device never keeps more than 512 turns
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks keptIsBounded during lexlean verify in the telemetry workflow
    Then no input meets breaksKept

  @TL-22 @build
  Scenario: An app the kernel refused anything is never shown as all clear
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks refusedIsShown during lexlean verify in the telemetry workflow
    Then no input meets breaksRefusalHidden

  @TL-23 @build
  Scenario: An app is never shown as reaching a site it was never allowed to reach
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks reachNeedsAllowance during lexlean verify in the telemetry workflow
    Then no input meets breaksReachUnallowed

  @TL-24 @build
  Scenario: A refused site is never shown as only allowed
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks refusedSiteIsShown during lexlean verify in the telemetry workflow
    Then no input meets breaksSiteRefusalHidden

  @TL-25 @build
  Scenario: A refusal is never counted as allowed, and an allowance never as a refusal
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks refusalNeverAllowed during lexlean verify in the telemetry workflow
    Then no input meets breaksMiscounted

  @TL-26 @build
  Scenario: Every allowance and every refusal is counted once
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks decisionCountedOnce during lexlean verify in the telemetry workflow
    Then no input meets breaksUncounted

  @TL-27 @build
  Scenario: The time an app or a site was last seen never moves back
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks lastNeverMovesBack during lexlean verify in the telemetry workflow
    Then no input meets breaksLastBack

  @TL-28 @build
  Scenario: The device never keeps more than 256 apps
    Given the model in studio/telemetry/src/Telemetry.lex.tex
    When the Lean kernel checks appsKeptIsBounded during lexlean verify in the telemetry workflow
    Then no input meets breaksAppsKept
