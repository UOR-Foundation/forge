# Imported input contract boundary

FA-12 implements `FoundrySpecification.hostInputBoundary` and `HostInputError`.
The existing owned renderer bridge publishes the imported schemas themselves:
310 input schemas, including input schemas for all 306 contracted outputs.
The browser dispatch supplies the input validator before invoking a handler.
Missing or broken validators and invalid arguments refuse without handler effects.
Input is structured-cloned before parsing; the handler receives the imported
schema's parsed/defaulted value. Output validation remains separate and preserves
the handler's original successful output.

The declared scope is imported renderer contracts. Legacy channels lacking both
imported schemas retain legacy behavior and are not claimed input-validated.
Representation validation does not establish permissions, entity ownership,
transaction isolation, or complete journey coverage.

Registration, scenario and a failing Rust test preceded implementation. Eight
Node controls execute the adapter and actual host dispatch, covering invalid and
missing schemas, extra/untransferable arguments, parsed defaults, caller mutation,
unsupported/legacy behavior and output refusal after valid input. The separate
renderer test bundles the production bridge and imported Zod contracts with the
locked esbuild dependency. It checks complete schema publication and exercises
an actual generated client: invalid get-app arguments invoke no handler, while a
valid identifier is delivered to it.

Removing input admission or retaining the caller-owned input both fails the full
eight-test suite. Mutations are restored. The complete Rust workspace, existing
renderer error/recovery test, contract-scope checker and shell parser pass locally.
The owned TypeScript bridge passes the repository's pinned formatter and linter.
Full vendored type checking is reported separately because this repository omits
upstream Pro and test-support sources; the unchanged parent branch produces the same 87 diagnostics, byte-for-byte.
No new type diagnostic is introduced by this overlay change. Full SDK/Studio acceptance
of the feature revision remains required.
