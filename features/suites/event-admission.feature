Feature: event-admission

  @FA-19 @build
  Scenario: Typed event admission binds exact feature routes to current composition policy, generation, sequence and bounded payloads
    Given exact producer and consumer references in a declared event contract
    When an envelope is admitted against current features and policy
    Then composition admission is rechecked including revoked permissions
    And stale generation, replayed sequence and undeclared routes are refused
    And mismatched or oversized payloads return typed errors
    And acceptance advances only the supplied sequence and does not claim delivery
