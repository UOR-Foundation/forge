Feature: private-provider-credentials

  @FA-47 @build
  Scenario: Provider credentials never become public release assets
    Given visitor-owned OpenRouter and Featherless device settings
    When inference selects its credential and a release is assembled
    Then no public site credential is fetched or accepted as a fallback
    And missing or invalid device credentials refuse without inference requests
    And the workflow exports no provider secret into public files
    And both projection and independent inventory refuse a legacy credential file
