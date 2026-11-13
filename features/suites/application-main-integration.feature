Feature: application-main-integration

  @FA-59 @build
  Scenario: Current main integrates without losing application protocols or verified offline ownership
    Given current main experience models and the complete application feature stack
    When the combined application is built and projected
    Then every protocol and experience acceptance vector remains reachable
    And renderer privacy local editor and verified offline closure remain enforced
    And source executable and release evidence are qualified for the combined identity
