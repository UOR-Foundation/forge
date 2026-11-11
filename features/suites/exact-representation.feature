Feature: exact-representation

  @FA-14 @build
  Scenario: Byte representations verify original, payload, decoder specification and optional basis identities before returning exact reconstructed bytes
    Given the fixture FA-14 needs
    When the suite exercises FA-14
    Then Byte representations verify original, payload, decoder specification and optional basis identities before returning exact reconstructed bytes
