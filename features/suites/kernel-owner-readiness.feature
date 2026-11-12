Feature: Verified kernel owner readiness
  @FA-73 @build
  Scenario: Preview waits for its initializing document guest
    Given a controlled document whose exact guest verification is still running
    When the service worker requests execution for the matching identity
    Then no unverified execution or premature refusal occurs
    And completion executes only after all local verification succeeds

  @FA-73 @build
  Scenario: Failed or foreign ownership cannot become execution authority
    Given failed guest integrity or a foreign controller or mismatched identity
    When a service worker requests execution
    Then the request is refused with a fixed typed failure
    And initialization capacity and failed-owner recovery remain bounded
