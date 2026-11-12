Feature: Atomic initial project theme
  @FA-71 @build
  Scenario: New project inherits the committed Home theme atomically
    Given a validated selected built-in or custom generation theme
    When a scaffold project and its initial chat are created
    Then the project theme is committed with all project records
    And late abort or invalid selection leaves no partial project

  @FA-71 @build
  Scenario: Deletion and first prompt preserve selection ownership
    Given two windows creating projects and deleting custom themes
    When the transactions settle
    Then no project or Home selection references the deleted theme
    And first prompt consumes the committed theme without reapplying stale settings
