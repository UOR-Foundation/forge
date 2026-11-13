Feature: Exact initial renderer stylesheet identity
  @FA-62 @build
  Scenario: Vite reuses the initial stylesheet across actual renderer navigation
    Given the generated entry and locked renderer are served from a nested deployment path
    When the home and settings screens load
    Then the renderer stylesheet is requested exactly once and the screens remain styled
    And the existing guest performance budgets and complete verified worker closure remain unchanged
