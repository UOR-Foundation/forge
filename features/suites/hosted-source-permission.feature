Feature: Hosted source permission
  @FA-83 @build
  Scenario: Stateful streaming remains local until its hosted source disclosure is accepted
    Given a captured application and generation turn without hosted permission
    When runnable module prefixes or final checks are produced
    Then no source is sent until the owner accepts the destination and this-turn source scope
    And denial or cancellation sends no request and does not authorize a later turn

  @FA-83 @build
  Scenario: Permission cannot authorize stale or unrelated source effects
    Given an approved source or generation turn
    When its owner changes or permission expires or is revoked
    Then subsequent hosted requests are refused and late preview results are discarded
    And redirects credentials malformed responses and undisclosed RPC effects are refused

  @FA-83 @build
  Scenario: A fresh permission scope can retry the same source without accepting stale frames
    Given a refused preview attempt and a new turn with identical module bytes
    When the new turn explicitly approves its own hosted scope
    Then parsing retries under the new scope and the current frame is rendered
    And reselecting an existing frame cancels any different pending source before updating its trust
