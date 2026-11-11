Feature: bounded-build-modules

  @FA-27 @build
  Scenario: Portable builds fetch only bounded approved-origin modules and retain exact module-byte receipts
    Given a portable browser build resolving JavaScript modules from the declared registry origin
    When imports succeed, redirect, stall, exceed limits or leave the approved origin
    Then unapproved requests are refused before network access and redirects never receive credentials
    And one operation deadline bounds all module response bodies and compilation waits
    And exact UTF8 module bytes and SHA256 identities are retained with the portable archive
    And failure cancels outstanding module requests without claiming a complete package lock
