Feature: Atomic browser settings transactions
  @FA-63 @build
  Scenario: Concurrent settings patches preserve disjoint values and credential removal
    Given two windows share the origin settings record
    When they update disjoint preferences concurrently
    Then both committed preferences remain present
    And a later credential removal is not overwritten by an earlier stale settings read
    And a request success followed by transaction abort refuses without changing durable state
