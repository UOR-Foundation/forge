# FA-86 — In-tab kernel verdict

Authority: `InTabKernel.verdictCode`, `InTabKernel.wordOf`, `InTabKernelProtocol.dispatchVerdict` and `InTabKernelProtocol.verdictWireBoundary`.

A verdict is decided from what the tab derived and what its own kernels answered. The request carries the pinned and the derived address of the library, of the bundle and of the kernel, the spec statement's and the checked statement's address, the declared and the observed axiom set, and four flags: Lean's kernel ran, it accepted, the second kernel ran, it accepted. The guest compares each pair of addresses; the caller cannot state that they agree. `proved` needs Lean's kernel to have run in the tab and accepted. Without it, an accepting second kernel reads `kernel-checked`. Kernels that disagree refuse. No field carries what a server said, and `InTabKernel.noVerdictFromTheServer` proves the verdict does not depend on one.

The protocol has exactly 72 request words and three response words, in bounded lowercase little-endian hexadecimal. The JavaScript codec (`studio/shell/in-tab-verdict-codec.mjs`) writes requests and reads replies; it implements no rule of the model. `studio/tools/in_tab_verdict_author.mjs` writes the protocol module, the corpus and the kernel's three references to them, and `--check` refuses drift.

## Local evidence

The FA-86 ID, scenario and failing test preceded the implementation (`just new-capability`; the test panicked "FA-86 is registered and not built").

Lean proved the model and the protocol on the hosted verifier, profile `prism-app`: six modules, attestation `11d8806e3a86e6c65ce3591adbbb3414c48c12175dabf03d05a37d59a576bd5e` (`in-tab-kernel-verdict-proof.json`). That covers the model's 15 theorems and nine wire theorems, each a corpus vector Lean evaluates. The hosted verifier is a diagnostic; it does not replace the locked SDK.

In the locked SDK image, `lexlean fmt --check --all` and `lexlean lock --check` pass on all 24 modules.

The corpus has 19 vectors: 16 typed and three raw. The six-test Node suite passes, the 144-test Rust conformance suite passes, and `check-model` and `cargo fmt --check` pass. On Linux the 636-test Studio suite passes but for `home_card_keyboard`, whose `happy-dom` dependency is not installed here.

Seven planted codec defects were each refused (`node studio/tools/in_tab_kernel_verdict_defects.mjs`): a reply whose word is not its code believed; an extra field ignored; an axiom outside the admitted three dropped; an address cut to 128 bits; the request read after the guest is ready; a flag other than 0 or 1 sent; a guest fault read as proved. Restoring the codec restores the suite. Two rules no test could fail, a reply-length bound and a bytes check, were removed: the two exact reply shapes already imply both.

Five existing suites pinned the kernel's acceptance root as `previewAcceptance`; it is now `verdictAcceptance`, which ends in `previewAcceptance`. The count of acceptance requests in the model moves from 321 to 340.

## Open qualification

`prismpm verify` did not complete locally: the SDK ended with `PP5007: application-lean timed out`. So the guest has not been built from this model here, and the 19 vectors have not been replayed in a compiled guest. The ten vectors Lean did not evaluate, the three raw ones among them, rest on `in_tab_verdict_author.mjs`'s reading of the model until that replay. CI's `just vv` is the authority for both.

The installed, signed guest (`studio/shell/kernel/kernel.holo`) predates this protocol and answers `verdict` requests as it answers any unknown word. No host handler calls the codec. A new signed guest, runtime and browser replay, and Studio acceptance remain mandatory before the studio shows a verdict from it.

This is the verdict rule and its wire. It does not run a kernel, derive an address, audit axioms or fetch a proof; those are `v2/in-tab-kernel/` prototypes that no published build reads. Nothing here establishes that the tab's inputs are what they claim: a caller that lies about what its kernel answered gets the verdict its lie describes. No independent review or release acceptance is claimed.
