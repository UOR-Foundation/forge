Feature: publication-cancellation

  @FA-04 @build
  Scenario: Cancelling publication prevents subsequent browser requests and bounded requests return typed failures
    Given the real GitHub publication adapter and a cancellation signal
    When cancellation occurs before a request or during a request or polling delay
    Then the adapter returns cancelled and sends no subsequent request
    And stalled requests and response bodies return timedOut
    And HTTP, network and malformed JSON failures retain their modeled error codes
    And submitted remote work is not represented as rolled back
