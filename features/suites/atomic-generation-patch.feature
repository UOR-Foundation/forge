Feature: atomic-generation-patch

  @FA-23 @build
  Scenario: Generated file batches commit against captured project source and cancellation prevents uncommitted project writes
    Given model-supplied file operations and the source captured for their request
    When a bounded unambiguous batch is prepared and committed
    Then writes, deletions, renames and exact direct dependency requests commit together
    And stale source, invalid operations and cancellation refuse uncommitted changes
    And the chat records completed batches even if later work is cancelled
