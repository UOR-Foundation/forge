Feature: Current live module generation integration

  @FA-69 @build
  Scenario: A generation request retains canonical module authority and exact theme consent
    Given a captured app module and selected theme
    When the renderer submits a generation turn
    Then the provider disclosure contains that module and detached theme prompt
    And generated implementation files cannot replace canonical source
    And the chat does not expose streamed module text as prose

  @FA-69 @build
  Scenario: Live edits and every-app replay retain checked source transitions
    Given the current declared live application corpus
    When live rendering and modification are replayed
    Then draft presentation cannot claim proof or publication
    And accepted patch operations retain source capture and cancellation checks
    And every rejected operation is disclosed
    And the full existing acceptance boundary remains required
