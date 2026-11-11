Feature: work-protocol

  @FA-17 @build
  Scenario: The generated guest executes bounded work ownership requests and returns exact state or typed refusal
    Given the fixture FA-17 needs
    When the suite exercises FA-17
    Then The generated guest executes bounded work ownership requests and returns exact state or typed refusal
