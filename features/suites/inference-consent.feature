Feature: inference-consent

  @FA-34 @build
  Scenario: Cloud requests disclose exact transmitted data before permission
    Given a cloud provider, model, credential owner and exact encoded request
    When a user reviews that request
    Then only explicit approval permits its submission
    And refusal, cancellation, timeout and offline state prevent submission
    And active requests expose a stop control without promising remote rollback
