Feature: snapshot-bound-builds

  @FA-26 @build
  Scenario: Preview and portable publication consume one verified snapshot and cannot bypass rule publication through an absent cache
    Given captured project source with its content-addressed snapshot and file objects
    When preview or portable publication builds that source
    Then every source byte and project name agrees with the verified snapshot
    And direct dependency metadata agrees with its snapshot declaration
    And a later source change prevents promotion as the current preview or publication
    And a snapshot containing a rule spec requires the rule publication route even without cached proof state
