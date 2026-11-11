Feature: feature-composition

  @FA-06 @build
  Scenario: The LexLean composition model rejects duplicate identity, missing dependencies, conflicts, incompatible inputs, ungranted effects and excess budgets
    Given versioned feature contracts and a separate composition policy
    When the recursive LexLean admission checks the ordered feature graph
    Then dependencies and input producers must precede consumers at their exact version
    And conflicts in either direction, ungranted effects and missing targets or evidence are refused
    And cumulative CPU and memory budgets must hold
    And every refusal and both admitted examples have kernel-checked proof controls
