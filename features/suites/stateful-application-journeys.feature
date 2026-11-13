Feature: stateful-application-journeys

  @FA-42 @build
  Scenario: Gallery and garden projects retain coordinated application state
    Given a canonical interaction application with bounded presentation data
    When a user creates opens and interacts with its generated guest
    Then the selected frame persists atomically and recovers after reload
    And changed models and competing writes refuse stale state
    And audio requires a fresh gesture and reduced motion suppresses animation
    And malformed source and unavailable execution have private typed refusals
