Feature: Reproducible browser host bundle
  @FA-64 @build
  Scenario: The complete browser host loads without a static module waterfall
    Given locked host sources and the locked renderer compiler
    When the host bundle is generated twice in distinct directories
    Then its bytes and source receipt are reproducible with preserved module URL identities
    And changed inputs artifacts compiler identity and escaping dependencies refuse
    And the generated entry and complete verified closure retain every browser journey and performance budget
