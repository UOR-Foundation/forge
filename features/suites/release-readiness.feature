Feature: release-readiness
  @FA-85 @build
  Scenario: Release readiness binds complete exact-head evidence without mutations
    Given an exact pull-request head and base and an explicit upstream lane policy
    When the read-only collector gathers complete paginated evidence and rereads identity
    Then only exact successful required workflow jobs qualify their lanes
    And any policy-required independent review refers to an existing exact review and reviewed head and live base
    And the live target reference and tip are checked independently of cached pull-request metadata
    And technical assessment never becomes GitHub approval or a new permission prerequisite
    And API source metadata and merge parents never prove the tested checkout or current-base execution
    And a merge-execution policy refuses without independently bound checkout evidence
    And offline replay is labeled non-live rather than replacing fresh collection
    And source-metadata machine qualification remains separate from owner and merge qualification
    And every review thread is resolved and the complete thread set is available
    And ancestry and stack dispositions name checked commit relationships only
    And the collector never approves merges closes or publishes contributions

  @FA-85 @build
  Scenario: Incomplete ambiguous stale or unrelated evidence cannot acquire readiness
    Given a previously passing exact-head evidence fixture
    When its head base target merge parents lane job review or pagination is corrupted
    Then a fixed typed refusal prevents readiness
    And skipped cancelled missing duplicate fork-substituted and stale evidence fails closed
    And unavailable review threads and unknown ancestry never count as acceptance
    And private credentials and exception payloads are absent from the report
