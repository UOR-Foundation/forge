Feature: Sidebar tool access

  @FA-68 @build
  Scenario: Tools do not cover the renderer chat controls
    Given the actual renderer at desktop and mobile sizes
    When an app is opened and the auxiliary menu is used with a pointer
    Then no Foundry tool entry intercepts the composer or menu target
    And preview permissions, interactive apps and discovery remain reachable in the sidebar

  @FA-68 @build
  Scenario: Renderer sidebar replacement preserves one set of working tool controls
    Given the page owns one tool dock
    When sidebar drawers and routes are repeatedly closed and opened
    Then the visible sidebar owns exactly one copy of every entry
    And the original tool dialogs still open and close by native controls
