Feature: durable-version-preview

  @FA-54 @build
  Scenario: Preview ownership preserves the original project through selection closure and recovery
    Given verified canonical snapshots and an exclusive browser preview owner
    When a user selects a historical version returns restores or closes the preview
    Then the guest transition and exact source change commit atomically
    And unrelated edits cannot overwrite an owned historical checkout
    And a competing window cannot claim ownership while the owner remains live
    And interrupted ownership recovers without substituting a different original source
    And stale identity deletion late abort and malformed imported commands refuse
