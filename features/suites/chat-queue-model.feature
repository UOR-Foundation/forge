Feature: chat-queue-model

  @FA-50 @build
  Scenario: Queue mutations preserve active work and stop policy
    Given a bounded queue with unique turn identities and an exclusive active owner
    When enqueue edit reorder remove pause resume claim complete or recovery is requested
    Then Prism rejects stale revisions owners and observed stop policies
    And active work remains at the head until completion or explicit recovery
    And malformed wire input cannot mutate the queue
