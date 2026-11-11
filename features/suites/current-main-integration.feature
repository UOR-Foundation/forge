Feature: current-main-integration

  @FA-24 @build
  Scenario: Current live editing and reword flows retain source-bound commits and the complete compiled kernel protocols
    Given the current main lifecycle and live editing behavior integrated with the conversion boundaries
    When live or agent edits commit and proof results return
    Then source races refuse and proof state remains bound to the accepted logic and source
    And the signed compiled guest retains lifecycle reword, composition and work protocols
    And the current renderer and its inherited verification gates remain active
