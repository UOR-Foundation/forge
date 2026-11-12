Feature: application-shape-authority
  @FA-84 @build
  Scenario: Application shape edits and transitions retain one source-bound authority and cannot obtain proof standing from authored files
    Given a captured project and its host-owned source-bound lifecycle
    When the editor saves a stateful module or an explicit turn changes its shape
    Then the complete bounded module is handled by its declared shape adapter
    And hosted checking still requires source permission
    And source and lifecycle compare-and-swap atomically remove obsolete authority
    And concurrent edits and lifecycle completion retain their own state
    And obsolete live frames and intents cannot reassert the old shape
    And mixed source cannot select or publish an obsolete decision
    And an imported or edited app.json cannot grant proof standing
    And source mutation without a lifecycle transaction invalidates stateful standing
    And cancelled approval before proof submission restores only its unchanged reservation
    And local preflight failure cannot leave an unsubmitted proof stuck proving
    And cancellation after remote submission does not falsely roll back remote work
    And Ask and Plan retain their read-only boundary
