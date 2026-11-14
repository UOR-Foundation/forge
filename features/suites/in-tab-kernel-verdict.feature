Feature: in-tab-kernel-verdict

  @FA-86 @build
  Scenario: A proof verdict is decided by the Prism guest from addresses the tab derived and the result of a kernel run in the tab, never from a server reply
    Given the pinned and derived addresses of the library, the bundle and the kernel, the spec's and the checked statement, the declared and observed axioms, and what each kernel in the tab answered
    When a verdict is requested with exactly 72 unsigned words
    Then the guest compares each pair of addresses itself and answers proved only when Lean's kernel ran in the tab and accepted
    And altered bytes another kernel another statement other axioms an axiom outside the admitted three and kernels that disagree refuse
    And a request with a field for a server reply a flag that is not Boolean or any other length is refused before or by the guest
