Feature: studio-pr-concurrency

  @FA-56 @build
  Scenario: Superseded pull request work cannot consume the current Studio acceptance slot
    Given multiple Studio runs for a pull request and independent main runs
    When a newer pull request revision is submitted
    Then only the older run of that same pull request is cancelled
    And every retained run executes the complete existing acceptance lane
    And changed or missing concurrency policy refuses projection verification
