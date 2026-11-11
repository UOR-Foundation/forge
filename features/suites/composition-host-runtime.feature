Feature: composition-host-runtime

  @FA-10 @build
  Scenario: The browser host composes features only through its pinned and replayed generated kernel
    Given the committed generated guest and its archive-bound metadata
    When a browser caller requests feature composition
    Then every acceptance vector has passed before the actual model decides
    And corrupt artifacts, malformed metadata and invalid requests refuse with typed errors
