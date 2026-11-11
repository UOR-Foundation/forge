Feature: composition-protocol

  @FA-07 @build
  Scenario: The generated guest decodes bounded composition requests and returns the model admission result
    Given the versioned binary composition protocol and browser representation adapter
    When declarations are serialized and passed to the generated guest
    Then only the LexLean admission model decides composition acceptance
    And malformed, oversized, truncated and trailing inputs are refused
    And the guest acceptance corpus covers successful and refused wire requests
