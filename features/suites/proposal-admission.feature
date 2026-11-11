Feature: proposal-admission

  @FA-18 @build
  Scenario: Router proposals resolve exact registered feature versions and cannot bypass ambiguity, registry revision or composition admission
    Given a declared feature registry and independently expected intent and registry revisions
    When a router proposes feature references with confidence and unresolved issues
    Then exact registered contracts are resolved in the proposed dependency order
    And unresolved ambiguity, constraints, unknown references and stale revisions are refused
    And composition admission checks the resolved contracts regardless of proposal confidence
    And proof controls retain typed refusals for missing dependencies, permissions and budgets
