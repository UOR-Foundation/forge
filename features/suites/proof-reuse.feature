Feature: proof-reuse

  @FA-85 @build
  Scenario: A theorem Lean proved on the same declarations is reused instead of proved again, and only changed theorems go to Lean
    Given an app whose theorems Lean proved on the hosted verifier, with a record filed under each theorem's address and current toolchain-bound trust evidence
    When the app is proved again unchanged, with one theorem edited, or with a definition some theorems reach edited
    Then an unchanged app is proved with no Lean run and the axiom sets Lean observed
    And only the theorems whose own or reached declarations changed are sent to Lean, in one run
    And a record whose address, verifier, bytes, headers or attestation do not re-derive is refused with a typed reason and its theorem is proved again
    And an unreadable or failing store never fails a proof
    And a missing trust epoch, a retired toolchain, legacy records or a bare found response never authorize reuse
    And changing a toolchain address or the trust epoch with an unchanged profile re-proves every theorem
    And the exact attestation must cover every recorded digest under the current trust descriptor
    And a verifier change during admission or a partial proof reruns the whole proof without reuse
    And a completed proof is never filed under a toolchain that did not attest it
