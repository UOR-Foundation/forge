Feature: verified-shell-cache

  @FA-29 @build
  Scenario: Worker activation requires bounded independently verified shell bytes including renderer and scaffold closure
    Given the projected shell manifest and its worker-pinned closure
    When the worker installs the version
    Then every declared file length and SHA256 must match before cache publication or activation
    And renderer assets and scaffold files belong to that same closure
    And corrupted, missing, redirected, malformed or timed-out responses refuse installation
    And the active worker serves its own verified version while offline
