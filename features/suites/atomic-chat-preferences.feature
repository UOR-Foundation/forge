Feature: Atomic chat preferences
  @FA-77 @build
  Scenario: Mode and model selection survive concurrent edits and reload
    Given an existing chat and its imported update contract
    When separate windows update its title mode model and transcript
    Then each committed field remains after reload without losing unrelated fields
    And the selected model is used in the next disclosed request

  @FA-77 @build
  Scenario: Invalid or uncommitted preferences are not acknowledged
    Given invalid input a deleted chat or a transaction that aborts after a successful write
    When a preference update is requested
    Then a fixed typed failure is returned without partial writes or resurrection
