Feature: message-linked-restoration

  @FA-55 @build
  Scenario: Restored source and retained chat history share one durable acknowledgement
    Given canonical source versions and an exact chat message boundary
    When a user restores a message or restores a version with a chat boundary
    Then the verified source and truncated or forked chat commit atomically
    And the original chat remains unchanged for a fork
    And source-only and chat-only outcomes remain distinct
    And active work stale chat state missing versions and late abort refuse without partial success
