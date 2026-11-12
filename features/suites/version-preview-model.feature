Feature: version-preview-model

  @FA-53 @build
  Scenario: A preview owner preserves the original content identity through selection and recovery
    Given a bounded preview state with exact 256-bit source identities
    When acquire select return restore or abandoned-owner recovery is requested
    Then the guest preserves the original source until an admitted return or restore
    And stale revisions conflicting owners invalid states and exhausted counters refuse
    And exact bounded wire requests and replies execute in the signed guest
