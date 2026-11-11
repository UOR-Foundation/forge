Feature: application-authority

  @FA-01 @build
  Scenario: The application authority model rejects missing or competing product authorities and unchecked external boundaries
    Given the authority admission declaration in app/src/FoundrySpecification.lex.tex
    When the locked SDK checks its seven authority proof controls
    Then zero and competing owners are rejected for product and external declarations
    And a single external owner requires a checked boundary
    And single-owner product and checked external declarations are admitted
    And source conformance rejects weakened proof statements or omitted entrypoints
