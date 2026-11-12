Feature: canonical-generation-ownership

  @FA-37 @build
  Scenario: Generated file batches respect canonical decision ownership
    Given a project with a declared decision specification
    When a generic generation batch touches its model-owned files
    Then the whole batch refuses before mutation
    And writes, deletions and both sides of renames obey the same ownership boundary
    And ordinary generated files still commit with captured-source comparison
