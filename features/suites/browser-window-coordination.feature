Feature: browser-window-coordination

  @FA-57 @build
  Scenario: Origin windows acknowledge actual ownership and recover missed invalidations
    Given uniquely locked window sessions and captured renderer contracts
    When focus visible entities tab ownership or interests change
    Then bounded session state commits before acknowledgement
    And interested peer windows receive admitted stream events
    And reloads recover missed invalidations or explicit recovery scopes
    And duplicate live sessions conflicting tab ownership stale state and late abort refuse
