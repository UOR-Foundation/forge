Feature: Editor load lifecycle

  @FA-66 @build
  Scenario: Cancelled initialization cannot strand a replacement editor
    Given the lazy imported loader and its first cancelable request
    When the first mount cancels before loading and another mount requests the editor
    Then only the cancelled caller receives cancellation
    And the replacement receives the fully configured editor without an unhandled rejection

  @FA-66 @build
  Scenario: Loading and theme failures remain owned and retry readiness truthfully
    Given a loading or configuration failure before readiness
    When the caller observes its result and a later request arrives
    Then the failure has its fixed typed code without private source details
    And readiness is recorded only after complete successful configuration
