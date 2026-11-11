Feature: atomic-project-creation

  @FA-21 @build
  Scenario: Project creation commits its files, objects, initial version and chat atomically with transaction-local identifiers
    Given a complete bounded scaffold and generated canonical snapshot bytes
    When concurrent project creations allocate identifiers inside their write transactions
    Then each project receives distinct app and chat identifiers and a complete initial snapshot
    And preparation failures and aborted writes leave no partial project records
    And chat creation and imported identifiers cannot overwrite an existing project or chat
