Feature: github-publication-permission

  @FA-45 @build
  Scenario: Public publication cannot outrun source-bound approval
    Given proved rules and the visitor configured GitHub credential
    When read-only discovery identifies the destination account
    Then publication discloses the exact model payload and public repository before writes
    And denial offline expiry cancellation and changed rules prevent further mutations
    And incomplete approval and mutable caller payloads cannot bypass the boundary
