Feature: command-ownership-registry

  @FA-43 @build
  Scenario: Commands have complete canonical ownership bindings
    Given the imported renderer contracts and actual browser command handlers
    When the canonical registry is projected and a command is dispatched
    Then every contract and handler has exactly one declared classification
    And missing duplicate changed or unavailable bindings refuse before effects
    And the inventory distinguishes implemented adapters from unavailable capabilities
