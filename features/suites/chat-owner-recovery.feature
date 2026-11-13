Feature: Durable chat owner recovery interest
  @FA-74 @build
  Scenario: Closing an owner wakes a surviving interested window
    Given an active durable head and another window holding its execution lock
    When a surviving subscriber waits before that owner closes
    Then the survivor acquires exclusive ownership and pauses the exact retained head
    And no cloud request repeats without explicit resumption

  @FA-74 @build
  Scenario: Disposed subscribers release their waiting interest
    Given a subscriber waiting for an execution lock
    When its document is disposed
    Then its waiting request is cancelled without writes or error publication
