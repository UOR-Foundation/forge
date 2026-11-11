Feature: authoring-projection

  @FA-02 @build
  Scenario: The authoring boundary checks every generated Studio module and export root without rewriting drift
    Given the authoringBoundary in app/src/FoundrySpecification.lex.tex
    When the actual author script runs in check mode against the canonical Studio sources
    Then every projected module and export root is compared byte for byte
    And missing unreadable and diverged projections produce typed path diagnostics
    And check mode never repairs drift or creates missing projections
    And independent mutations of all six outputs and authoring input are rejected
    And explicit regeneration restores a matching projection
