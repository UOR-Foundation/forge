Feature: deferred-host-readiness

  @FA-62 @build
  Scenario: Renderer startup waits for real host results without blocking initial rendering
    Given captured bounded invocations and pending listener registrations
    When the real typed host becomes ready or its startup deadline expires
    Then only the real host can acknowledge and execute queued calls in order
    And caller mutation overload cancellation invalid binding and timeout cannot invent effects
