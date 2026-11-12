Feature: browser-telemetry-isolation

  @FA-30 @build
  Scenario: The browser renderer never initializes vendor telemetry and cannot restore collection through stored settings
    Given a browser renderer with fresh or legacy opted-in settings
    When the application starts or settings are read and changed
    Then vendor telemetry is never initialized and no telemetry transport runs
    And telemetry identifiers and enable controls are absent from the browser settings surface
    And an attempt to enable collection receives a typed refusal
    And upstream source drift refuses the browser projection
