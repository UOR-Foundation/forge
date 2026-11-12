Feature: Source-bound gallery publication
  @FA-70 @build
  Scenario: Delayed gallery work cannot publish for a changed or deleted app
    Given a screenshot and description captured for a sealed project source
    When the source changes or the app is deleted before publication
    Then publication is refused without a durable record or success notification
    And readers never show unbound legacy cache contents as current media

  @FA-70 @build
  Scenario: Gallery publication is atomic and source checked across windows
    Given two windows producing media and text for the same captured source
    When their transactions commit
    Then both fields remain attached to that exact source
    And a late transaction abort reports failure and rolls back
    And corrupted records are refused with fixed typed failures
