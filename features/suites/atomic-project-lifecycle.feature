Feature: atomic-project-lifecycle

  @FA-25 @build
  Scenario: Project rename, deletion, checkout and revert commit coherent state and refuse stale sources
    Given an existing project with verified snapshots and captured source
    When a lifecycle operation commits or encounters a concurrent edit or storage failure
    Then app metadata, files, references, versions and proof invalidation remain coherent
    And deletion removes dependent chats and refuses later mutations
    And checkout restores exact validated bytes and revert creates one child of current history
