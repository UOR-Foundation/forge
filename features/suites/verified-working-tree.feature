Feature: verified-working-tree

  @FA-58 @build
  Scenario: Working source differences never silently replace missing or corrupt history
    Given atomically captured current project source and independently verified snapshot bytes
    When working files are added changed or deleted
    Then exact text differences and bounded line counts describe the captured source
    And corrupt history invalid paths and exhausted comparison budgets refuse
