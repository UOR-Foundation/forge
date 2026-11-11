Feature: event-wire-protocol

  @FA-33 @build
  Scenario: Typed events are admitted only by the compiled model
    Given current feature policy and a versioned event route
    When the bounded event wire request reaches the generated guest
    Then composition, payload, generation and sequence are independently checked
    And malformed requests and unknown responses refuse
    And page and worker replay the same independent event corpus
