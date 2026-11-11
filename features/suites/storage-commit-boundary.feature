Feature: storage-commit-boundary

  @FA-20 @build
  Scenario: Host storage requests report success only after transaction completion and refuse aborted or invalid operations
    Given a host storage operation whose request succeeds before its transaction commits
    When the transaction subsequently aborts
    Then the operation returns a typed failure and no success result
    And synchronous failures abort the transaction without exposing exception contents
    And successful reads and writes return their request result only after completion
