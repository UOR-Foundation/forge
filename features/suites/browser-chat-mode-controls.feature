Feature: Browser chat mode controls
  @FA-80 @build
  Scenario: Home defaults and existing chat modes remain independently durable
    Given canonical Build Ask and Plan choices and a mounted application
    When the user selects a Home default or an existing chat mode
    Then the choice survives reload in its owning settings or chat record
    And new applications and chats capture the selected default unless explicitly overridden

  @FA-80 @build
  Scenario: Invalid modes and aborted writes cannot appear successful
    Given an unsupported mode a missing chat or a late transaction abort
    When selection or chat creation is requested
    Then a typed refusal preserves existing state and a failed selection remains retryable
