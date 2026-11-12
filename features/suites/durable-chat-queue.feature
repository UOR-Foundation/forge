Feature: durable-chat-queue

  @FA-51 @build
  Scenario: Actual chat commands preserve queued work through concurrent edits and interruption
    Given a guest-admitted journal with captured bounded prompt payloads
    When the renderer submits edits reorders pauses resumes clears or cancels work
    Then acknowledgement follows an atomic revision-checked durable commit
    And only the exclusive owner executes the active head under existing effect permissions
    And stale cancellation cannot stop a newer invocation
    And reload recovery retains interrupted work paused for explicit resumption
