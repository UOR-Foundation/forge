Feature: Verified guest owner handoff
  @FA-75 @build
  Scenario: A document disappears during service-worker acceptance
    Given a controlled document holding an unanswered guest request
    When navigation replaces it with a new verified owner
    Then the same exact guest request completes through that owner within the original deadline
    And all acceptance vectors still pass before serving the preview

  @FA-75 @build
  Scenario: Handoff remains bounded and cannot grant guest authority
    Given absent or mismatched owners or repeated document replacement
    When the service worker cannot obtain a verified answer
    Then execution refuses with a fixed failure and all ports and timers close
