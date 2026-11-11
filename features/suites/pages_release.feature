Feature: pages_release

  @FR-01 @build
  Scenario: Only a complete clean exact-source Pages tree reaches deployment
    Given a new build of the reviewed last-live source and its registered export guard
    When Forge and the combined Pages tree are inspected recursively before upload
    Then every warmup.json basename is refused without reading its content
    And links, special files, missing roots and empty exports fail with a typed diagnostic
    And valid files have a deterministic source-bound SHA-256 inventory
    And the unchanged mobile Lighthouse, screens, Studio and full exact-SDK gates must pass
