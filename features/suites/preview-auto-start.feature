Feature: State-aware automatic preview startup
  @FA-82 @build
  Scenario: Only an initial matching idle snapshot starts automatically
    Given the selected application has a hydrated initial idle run snapshot
    When the preview panel mounts
    Then one automatic start uses the existing imported lifecycle
    And an absent foreign active stopped or failed snapshot does not automatically start

  @FA-82 @build
  Scenario: Declined preview stays declined through responsive remounts
    Given preview execution was declined and chat remains available
    When the layout remounts the preview and the user submits an Ask turn
    Then no new preview permission dialog blocks the composer
    And explicit retry can request preview permission again
