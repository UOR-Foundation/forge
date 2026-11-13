Feature: app-covers

  @AC-01 @build
  Scenario: App covers are captured only from the asked preview, never from a blank frame, and card words are stored only within the sentence and tag rules
    Given an app preview served in the worker's sandbox with the capture responder
    When the host asks that preview for its cover
    Then only the asked frame's answer is accepted and a forged answer from another frame is ignored
    And a blank or still loading preview yields no cover
    And a passing toast is hidden and the stored cover is a 1600 by 800 WebP of the preview's top
    And a card sentence outside 84 to 92 characters, without a final period, or with technical or praising words is refused
    And a card tag outside the fixed list is refused
