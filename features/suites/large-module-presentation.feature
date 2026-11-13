Feature: Large canonical module presentation
  @FA-76 @build
  Scenario: Large modules retain their complete checked interface
    Given the canonical Verdant module with more than twenty four rules
    When the host installs or replaces its compatible presentation
    Then every rule and declaration remains in canonical source
    And runtime checking remains distinct from eligibility for Lean proofs

  @FA-76 @build
  Scenario: Invalid tail rules cannot hide beyond a validation batch
    Given a large module whose later rule or presentation is invalid
    When presentation admission checks the complete specification
    Then malformed incoming logic is refused and corrupt prior presentation is reset
