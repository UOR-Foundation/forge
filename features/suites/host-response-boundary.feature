Feature: host-response-boundary

  @FA-03 @build
  Scenario: The browser host refuses unsupported channels and invalid contracted responses with typed errors
    Given the shipped host dispatch and imported output schemas
    When an absent handler, failed handler, invalid response or failed validator is invoked
    Then the invocation returns its typed refusal without synthesizing an empty success
    And both IPC entrypoints preserve the refusal code
    And successful handler output is preserved exactly
