Feature: preview-permissions

  @FA-39 @build
  Scenario: Preview network effects require disclosed revocable permission
    Given a captured project requesting preview network destinations
    When the visitor allows its explicit destination disclosure
    Then only the disclosed grant can be stored after source comparison
    And denial, cancellation, offline state and expiry create no grant
    And stored preview grants can be revoked after reload
