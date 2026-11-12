Feature: local-browser-compiler

  @FA-32 @build
  Scenario: Locked compiler closure and initialization recovery
    Given the exact browser compiler production archive
    When its local bytes initialize without networking
    Then actual TypeScript compilation succeeds and altered archives refuse
    And a failed initialization can be retried without a poisoned promise
