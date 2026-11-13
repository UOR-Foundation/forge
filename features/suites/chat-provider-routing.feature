Feature: Exact chat provider routing
  @FA-81 @build
  Scenario: Captured cloud selections retain exact provider and model identity
    Given a chat with an OpenRouter or Featherless model independent of Home defaults
    When the user submits a turn and explicitly approves its disclosed request
    Then the corresponding provider receives the exact selected model identifier
    And token accounting and transcript identity use the same captured route

  @FA-81 @build
  Scenario: Invalid explicit selections cannot silently select a different engine
    Given a malformed model selection or an unsupported provider
    When chat routing is requested
    Then a fixed typed refusal occurs before transcript or network effects
