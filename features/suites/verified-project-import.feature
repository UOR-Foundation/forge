Feature: verified-project-import

  @FA-28 @build
  Scenario: Imports validate bounded snapshot closure and discard authority-bearing metadata before atomic insertion
    Given an export containing app files, snapshot history, chat records and content-addressed objects
    When the export is prepared for import
    Then all current files and history objects must validate before any storage write
    And imported permissions, credentials, cached proofs and cross-app references cannot grant authority
    And a collision rename creates a snapshot whose name agrees with imported metadata
    And malformed, missing, corrupt, excessive or timed-out closure leaves storage unchanged
    And repeated historical file references consume the cumulative decoding budget before decoding
    And imported message IDs are renumbered safely for subsequent local conversation turns
