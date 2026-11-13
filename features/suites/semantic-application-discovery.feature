Feature: Semantic application discovery
  @FA-49 @build
  Scenario: Review a finite language proposal before creating its canonical application
    Given a bounded product catalog and an explicit supported vocabulary
    When a visitor asks for an application and reviews the guest proposal
    Then unknown or conflicting intent cannot create a partial application
    And changed intent or catalog invalidates creation
    And explicit acceptance creates the admitted profile with sound initially disabled
