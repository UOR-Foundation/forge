Feature: Durable generation theme library

  @FA-67 @build
  Scenario: Theme edits and app selections survive reload without lost concurrent updates
    Given an app and the exact imported theme catalog
    When two windows create and update custom themes and select one for the app
    Then their committed records retain distinct IDs and exact Dates and prompt bytes
    And the selected prompt is part of the next cloud request disclosure

  @FA-67 @build
  Scenario: Deletion and failed storage cannot leave dangling or partial theme selection
    Given apps selecting a stored custom theme
    When that theme is deleted or the transaction aborts after a request succeeds
    Then deletion clears all of its selections atomically
    And an aborted operation reports a typed failure with the prior durable state intact
    And malformed or corrupt records cannot become successful empty results
