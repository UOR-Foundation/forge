Feature: canonical-module-boundary

  @FA-35 @build
  Scenario: A module cannot gain acceptance by discarding its meaning
    Given a bounded canonical decision module or a malformed variant
    When the authoring reader reconstructs its decision model
    Then every non-proof declaration must survive canonical reconstruction
    And duplicate names and unsupported fields or bounds refuse
    And parser failures have a fixed typed code without source disclosure
    And a streamed header may show its title without inventing decision logic
