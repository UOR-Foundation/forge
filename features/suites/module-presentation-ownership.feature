Feature: Module presentation ownership
  @FA-72 @build
  Scenario: Replacing a decision profile removes incompatible presentation
    Given a stored RSVP module with a custom view and answer meanings
    When a canonical parking module replaces its logic and interface
    Then the source transaction stores only compatible parking presentation
    And the previous canonical module path is removed
    And the user sees a presentation reset note

  @FA-72 @build
  Scenario: Compatible rule edits retain checked words without copying prior logic
    Given a checked presentation for a canonical interface
    When rules change without changing the interface
    Then the detached presentation is retained with the new logic
    And malformed incoming modules are refused before effects
