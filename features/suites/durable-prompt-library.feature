Feature: durable-prompt-library

  @FA-61 @build
  Scenario: Prompt records persist without fabricated success or lost concurrent updates
    Given validated imported prompt contracts and a bounded origin-local journal
    When windows create update list and delete prompts
    Then unique identities and slugs survive reload with exact content and Dates
    And invalid input corrupt records duplicate slugs and late transaction abort refuse
