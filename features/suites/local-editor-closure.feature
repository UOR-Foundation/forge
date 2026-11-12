Feature: local-editor-closure

  @FA-31 @build
  Scenario: The editor loads only from integrity-checked locked package bytes inside the active shell closure
    Given the exact locked Monaco package and its SHA512 integrity
    When the browser renderer and shell are staged
    Then bounded package bytes and licenses are independently verified before staging
    And the editor loader and workers resolve within the same-origin shell closure
    And missing, changed, escaping or oversized package data refuses staging
    And Settings and an actual editor remain usable offline without CDN requests
