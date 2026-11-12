Feature: portable-build-permission

  @FA-44 @build
  Scenario: A portable build discloses and bounds its effects
    Given captured source and the fixed package and styling destinations
    When the user explicitly permits the portable build
    Then only that source is compiled and its temporary styling grant is bound to the approval
    And denial offline expiry revocation and source changes refuse without promotion
    And stop aborts active requests and removes the temporary grant and frame
