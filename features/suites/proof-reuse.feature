Feature: proof-reuse

  @FA-85 @build
  Scenario: A theorem Lean proved on the same declarations is reused instead of proved again, and only changed theorems go to Lean
    Given an app whose theorems Lean proved on the hosted verifier, with a record filed under each theorem's address
    When the app is proved again unchanged, with one theorem edited, or with a definition some theorems reach edited
    Then an unchanged app is proved with no Lean run and the axiom sets Lean observed
    And only the theorems whose own or reached declarations changed are sent to Lean, in one run
    And a record whose address, verifier, bytes, headers or attestation do not re-derive is refused with a typed reason and its theorem is proved again
    And an unreadable or failing store never fails a proof
