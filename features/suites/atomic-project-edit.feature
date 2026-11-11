Feature: atomic-project-edit

  @FA-22 @build
  Scenario: File edits atomically commit a source-bound snapshot or refuse concurrent project changes without partial writes
    Given files and a main reference captured from one consistent project read
    When an edit prepares the generated snapshot outside the write transaction
    Then the write transaction compares the complete captured source before committing
    And concurrent changes refuse without overwriting files or advancing the reference
    And file objects, snapshot, version and app update commit together
    And changing the rules source clears cached rule status in the same transaction
