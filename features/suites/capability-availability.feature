Feature: capability-availability

  @FA-15 @build
  Scenario: Unimplemented browser queries return typed unsupported errors rather than fabricated resource status or empty findings
    Given the fixture FA-15 needs
    When the suite exercises FA-15
    Then Unimplemented browser queries return typed unsupported errors rather than fabricated resource status or empty findings
