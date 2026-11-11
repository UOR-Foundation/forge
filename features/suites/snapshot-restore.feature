Feature: snapshot-restore

  @FA-08 @build
  Scenario: Snapshot restoration validates every referenced object before atomically replacing files and the main reference
    Given a stored snapshot and a working project
    When the user restores that snapshot
    Then each snapshot and file identity and length is checked before writing
    And missing or corrupt dependencies leave the working project unchanged
    And one transaction replaces the files and main reference and clears stale proof state or rolls all changes back
