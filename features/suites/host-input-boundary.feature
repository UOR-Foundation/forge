Feature: host-input-boundary

  @FA-12 @build
  Scenario: Imported renderer input contracts validate browser commands before any handler effect
    Given the fixture FA-12 needs
    When the suite exercises FA-12
    Then Imported renderer input contracts validate browser commands before any handler effect
