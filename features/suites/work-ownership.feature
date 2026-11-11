Feature: work-ownership

  @FA-13 @build
  Scenario: The Prism work model reserves capacity before execution and preserves spending and checkpoints across suspension with owner and revision checks
    Given one work item with a positive owner, finite capacity and outstanding obligations
    When its declared owner applies an action at the current revision
    Then execution requires a reservation and progress cannot overspend or overclaim outstanding units
    And every accepted transition advances the revision
    And suspension and owner transfer preserve consumed work, unused reservation and achieved checkpoint
    And completion requires no outstanding units and releases unused reservation
    And malformed state, wrong owners and stale revisions have typed refusals
    And finite proof controls compare complete resulting records through the Lean kernel
