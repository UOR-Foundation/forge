Feature: live-lexlean

  The studio's live preview checks an app's canonical LexLean module by local
  obligations, one per region of the request space. Lean proves once, for every
  model, that passing them is enough, and its kernel decides the Verdant Resonance
  fixture's (studio/proof, built by the studio workflow).

  @LL-01 @build
  Scenario: Every guarantee holds on every request in the bounds when every local obligation passes
    Given studio/proof/PrismLive/Regions.lean
    When Lean builds regionCheck_sound and prints its axioms in the studio workflow
    Then for every model, a passing regionCheck means no request in the box breaks any guarantee, on propext and Quot.sound alone

  @LL-02 @build
  Scenario: Every guarantee of the Verdant Resonance fixture holds on every request in its bounds
    Given studio/proof/PrismLive/VerdantRegions.lean, generated from studio/tools/fixtures/live/verdant.lex.tex
    When Lean's kernel decides its obligations with decide +kernel in the studio workflow
    Then all_hold states that no request in the bounds breaks any of its guarantees, on propext and Quot.sound alone
