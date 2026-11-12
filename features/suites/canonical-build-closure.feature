Feature: canonical-build-closure

  @FA-38 @build
  Scenario: Imported and restored decision builds validate model projections
    Given a content-verified project snapshot carrying a decision specification
    When preview or portable build captures that source
    Then the checked canonical module and runtime must match their recorded bytes
    And malformed, missing or altered projections refuse before build effects
    And ordinary projects without a decision specification remain buildable
