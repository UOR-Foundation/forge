Feature: canonical-model-edits

  @FA-36 @build
  Scenario: Direct decision edits keep source and projections coherent
    Given a captured project with a canonical decision module
    When its module or authoring JSON is saved through the file editor
    Then validated semantics and generated projections commit in one source transaction
    And malformed edits and writes to the generated rule runtime refuse without mutation
    And stale sources refuse and model renames remove the prior active module atomically
