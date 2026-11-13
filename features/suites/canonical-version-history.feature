Feature: canonical-version-history

  @FA-52 @build
  Scenario: Imported version controls operate on verified canonical history
    Given version records bound to a project and canonical content addresses
    When a renderer lists versions reads differences or updates favorite and note metadata
    Then full hexadecimal aliases resolve to the exact canonical address
    And differences require verified snapshot and file bytes with core admission
    And metadata acknowledgement follows a transaction preserving concurrent fields
    And unknown versions missing projects malformed input and storage failure refuse
