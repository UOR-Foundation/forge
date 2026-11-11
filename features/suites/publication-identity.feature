Feature: publication-identity

  @FA-05 @build
  Scenario: Publication requires exact canonical archive identity and complete nonempty runtime acceptance
    Given a page identity and a fingerprint recomputed by the Prism archive reader
    When the actual publication build checks identity and runtime acceptance
    Then only equal canonical digests and complete nonempty passing acceptance produce success
    And malformed, missing, prefixed or mismatched identities return typed refusal
    And empty, inconsistent or failed acceptance returns typed refusal
