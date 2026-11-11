Feature: semantic-routing-model

  @FA-48 @build
  Scenario: Semantic relevance never becomes composition authority
    Given typed intent context and a versioned feature catalog with explicit semantic relations
    When the finite relation router proposes ranked candidates and dependency closure
    Then unknown concepts abstain and tied candidates expose ambiguity
    And stale intent or catalog missing permissions budgets and evidence refuse admission
    And identity labels never substitute for semantic relevance
    And independent held-out judgments and defect controls qualify the declared finite profile
