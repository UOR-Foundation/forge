# Generated work protocol

Authority: `WorkOwnership`, `WorkProtocol` and the `ForgeKernel.dispatch` export.
FA-17 encodes work operations as lowercase hex of little-endian uint32 words
following the ASCII `work ` header. Initialization carries four words; transitions
carry fifteen, including the complete prior state, caller owner, expected revision,
action code and three arguments. Unused arguments must be zero. The payload is
bounded to 120 bytes. Success returns `ok ` followed by eight encoded state words;
refusals are exact modeled error names. Revision 4294967295 refuses transition
before the protocol's scalar range can overflow. Guest response capacity is 128
bytes; the composition request/allocation limits remain intact.

`studio/shell/work-codec.mjs` only checks wire shape and scalar representability.
It does not implement admission or state transitions and returns a runtime failure
if guest execution fails. All semantics remain in the generated Prism guest.
This is a pure state transition interface: authentication, durable compare-and-swap
and actual effects require their own qualified adapters.

The registered scenario and failing Rust test preceded implementation. Seven Node
controls bind every action, malformed input/output, typed refusals, guest-only
delegation and all 30 independent corpus vectors to the embedded acceptance list.
The locked SDK must execute those vectors in the generated guest. Three targeted
Lean controls cover caller ownership, exact progress accounting and counter
exhaustion. Diagnostic and full-SDK results, mutation evidence, signed artifact
installation and browser qualification are recorded at the feature PR revisions.

The local diagnostic compiler verified all ten modules, including the three wire
proofs. Replacing the caller-owner word with the stored owner makes the Lean
kernel reject `wireRejectsWrongOwner`; the defect was restored. The browser guest
integration test rejects the previous composition-only archive, so it cannot
silently pass until the new work-capable artifact is installed and replayed.

Signed build 43016818911 rejected the first protocol revision because the generated
Rust projection flattened both modules' `dispatchWords` into one namespace
(E0428). The work module now names its dispatcher `dispatchWorkWords`. No compiler
limit, acceptance vector or proof was weakened to resolve this export collision.

Signed build 43017603564 at d3a3bbae7d33098d6da3720464317dd82117ab7d
produced the installed artifact, fingerprint
`8bac054c120cd91f6cc25c70ad0035ed06ab6a80c4c963c2e8d8bacf1bf19ce0`.
Independent replay passes all 109 embedded vectors, 26 composition wire cases,
30 work cases and the maximum composition payload. Provenance verifies against
the exact source digest and build workflow; wrong-source and changed-archive
controls fail. `kernel-artifact-receipt.json` records the component qualification.

The regenerated 18625-byte guest passes all eight loader/actual-host controls.
`forge:work` delegates through the wire-only adapter and the verified loader.
The actual guest completes reservation, execution, suspension, ownership transfer,
resumption and completion while retaining accounting and checkpoint state.
Chromium document and dedicated-worker contexts replay all 30 work and 26
composition cases, with all 109 embedded vectors required at loading.
Changing the encoder's endianness fails the seven-control wire suite. All three
wire proof statements are also pinned to the independent corpus by that suite.
The final combined revision still requires its full SDK and Studio gates.
