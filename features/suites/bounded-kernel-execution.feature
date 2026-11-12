Feature: bounded-kernel-execution

  @FA-60 @build
  Scenario: Complete guest replay and repeated dispatch preserve compiler availability
    Given the exact pinned pure guest and all declared acceptance vectors
    When browser execution admits captured requests through bounded workers
    Then every request retains a fresh guest instance
    And worker lifetime queue bytes and execution duration are bounded
    And failed workers release resources and later requests recover
    And the actual local compiler initializes and executes after full replay offline
