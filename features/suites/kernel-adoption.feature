Feature: kernel-adoption
  @FA-86 @build
  Scenario: Independent signed exact-input reproduction prepares immutable archive pins
    Given two independent successful signed builds of the same complete source inputs and immutable SDK
    When the adoption verifier checks repository workflow issuer artifact digests manifests and full bytes
    Then the existing archive verifier requires a nonempty committed acceptance vector set and replays every vector
    And explicit preparation stores both bundles with the component-reproduction receipt
    And the immutable pin names a separate archive-containing commit
    And a repeated preparation is a no-op only after renewed identity verification
    And a default plan makes no local or remote mutation
    And full SDK browser performance and live release qualification remain separate

  @FA-86 @build
  Scenario: Stale artifacts changed targets and uncertain pushes cannot replace accepted state
    Given independently reproduced component artifacts and a captured publication target
    When provenance inputs execution identity archive bytes vectors receipt or pin identity changes
    Then the verifier returns a fixed typed refusal without adopting the artifact
    And explicit builds never substitute different checkout and workflow source identities
    And publication proves the prepared final commit descends from the captured expected target
    And an atomic expected-reference comparison rejects target advancement even to an included ancestor
    And no history rewrite non-fast-forward content or generic force path is permitted
    And an uncertain push is reconciled before another attempt
    And no failure exposes private credentials or grants release standing
