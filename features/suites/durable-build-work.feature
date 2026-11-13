Feature: durable-build-work

  @FA-46 @build
  Scenario: Actual portable builds retain admitted work across interruption
    Given an exact captured project and the verified work guest
    When a browser owner reserves and executes a portable build
    Then a second concurrent owner cannot execute its effects
    And failure retains unused reservations and an explicit resumable obligation
    And completed output and guest checkpoint commit atomically for verified reuse
    And changed source corrupt output missing locks and guest refusal prevent promotion
