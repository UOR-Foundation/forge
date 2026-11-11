Feature: inference-effect-boundary

  @FA-11 @build
  Scenario: Cloud inference bounds requests and streamed responses and refuses cancellation, malformed data and provider failures explicitly
    Given the fixture FA-11 needs
    When the suite exercises FA-11
    Then Cloud inference bounds requests and streamed responses and refuses cancellation, malformed data and provider failures explicitly
