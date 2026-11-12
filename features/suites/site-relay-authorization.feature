Feature: Explicit site relay authorization
  @FA-65 @build
  Scenario: Site-funded inference preserves exact request disclosure and credential ownership
    Given no Featherless device credential and the declared site relay
    When the visitor reviews a captured cloud request
    Then no network request occurs before explicit approval
    And approval sends no browser credential to the disclosed relay
    And a visitor credential equal to the historical relay marker still goes only to the direct provider
    And denial cancellation malformed credentials and owner mismatches refuse
