Feature: durable-event-delivery

  @FA-40 @build
  Scenario: Accepted events survive reload without premature acknowledgement
    Given a source-bound event contract admitted by the generated guest
    When an event is admitted and its queue transaction completes
    Then its envelope and next sequence are durable together
    And reload preserves queued delivery until ordered consumer acknowledgement
    And stale sources, conflicting writers and bounded queue overflow refuse without losing queued work
