Feature: rules-source-binding

  @FA-09 @build
  Scenario: Rule status and asynchronous proof or publication completion remain bound to the current rule source
    Given a project with cached rule status and an asynchronous operation
    When the source or prior status changes before completion
    Then stale status is not displayed and stale completion cannot promote the current state
    And imported proof metadata is not treated as local approval or acceptance
    And a remote publication is not described as undone by a local refusal
