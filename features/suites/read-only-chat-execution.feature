Feature: Read-only chat execution
  @FA-78 @build
  Scenario: Ask and Plan replies cannot mutate or publish an application
    Given a queued Ask or Plan turn and an existing canonical application
    When the prompt requests approval or publication or the reply contains module and patch tags
    Then inference requires consent and the answer is retained in the transcript
    And source proof versions and preview state remain unchanged

  @FA-78 @build
  Scenario: Invalid modes are refused before execution
    Given an unrecognized execution mode
    When a chat turn requests execution
    Then a typed failure occurs before inference or project effects
