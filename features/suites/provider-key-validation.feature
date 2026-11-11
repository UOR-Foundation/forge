Feature: provider-key-validation

  @FA-16 @build
  Scenario: Provider credential validation rejects unsupported providers and requires a bounded authenticated response before success
    Given the fixture FA-16 needs
    When the suite exercises FA-16
    Then Provider credential validation rejects unsupported providers and requires a bounded authenticated response before success
