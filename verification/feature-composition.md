# Feature composition model evidence

FA-06 implements the admission portion of the `features` and `composition`
obligations in `FoundrySpecification.requirement`. Its semantic owner is
`app/src/FeatureComposition.lex.tex`; `ForgeKernel.application.libraryRoots`
includes `PrismForgeKernel.FeatureComposition.admitComposition` for certified
library export. No handwritten implementation of composition is introduced.

The model has typed versioned references, input producer/schema requirements,
feature contracts and composition policies. Contracts declare vocabulary, inputs,
outputs, state, events, errors, effects, dependencies, conflicts, projection
targets, accessibility/quality obligations and additive CPU/memory bounds.
Positive interned registry symbols identify these declarations. Registry symbol
binding and evidence authenticity are separate boundaries, not assumed proofs.

Admission walks a finite ordered graph. Each dependency/input producer must
already be admitted at the exact version; input schemas must match producer
outputs. Duplicate feature keys, missing dependencies, incompatible inputs,
conflicts in either direction, ungranted effects, unsupported targets, missing
evidence declarations and cumulative budget excess produce typed refusals.
Empty compositions and malformed declarations also refuse. An application and a
generated application supply distinct policies and graphs.

## Evidence and limits

Registration, scenario and failing source-conformance test preceded implementation.
Eighteen proof controls cover all ten error constructors and admitted single-feature
and dependent-feature cases. The conformance test pins control outcomes, defining
input defects, empty axiom policies, contract fields and the library export root.
It is a source-statement guard; it is not runtime execution evidence.

The isolated diagnostic compiler verified all six modules and the new controls,
with attestation `41a9a78e2de206886c9a23fe20cd690fdecaed82906c09ad7882541b9f4a5c40`.
That compiler differs from the lock, so only the complete remote SDK gate qualifies
repository acceptance and certified export. A planted change replaced the cumulative
budget condition with true. Lean rejected both CPU and memory refusal controls
with LLV7002. The original source was restored. All 40 local Rust workspace tests
and Clippy passed.

## Completeness review

Author review checked dependency ordering, version matching, bidirectional conflict
checks, cumulative rather than per-feature budgets, effect subset admission and
separate evidence-declaration checks. Empty state/events/effects are allowed for
pure features. Every public admission refusal has a negative proof control. This
is self-review, not independent approval.

This model is not the complete feature registry, intent router, generated UI,
provider-permission system or runtime resource meter. Declared evidence identifiers
do not prove their evidence valid. The finite controls do not constitute a general
inductive theorem about every graph. These distinctions prevent model admission
from being presented as whole-product acceptance.
