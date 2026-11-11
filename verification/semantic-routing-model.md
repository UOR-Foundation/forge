# Typed semantic routing model and protocol

Authority: `SemanticRouter.boundary` (FA-48), `RoutingProtocol.boundary` and
`ProposalAdmission.admitProposal`. The canonical command registry binds the
actual `forge:route` adapter to this model. JavaScript serializes requests and
responses; it does not rank candidates or decide admission.

The finite router uses explicit concept relationships and integer activation.
An exact concept match contributes 1000; a declared directed relation contributes
1–1000. Direct intent is weighted by 32001, so the bounded context contribution
can break ties without outweighing a one-unit direct-intent advantage. Context
cannot create a candidate with no direct support. Content identities do not
supply semantic similarity. Confidence remains zero rather than masquerading as
calibrated probability.

The dependency-first catalog has at most 32 unique feature keys. The top-ranked
candidate closes transitive needs and input producers, preserving dependency
order. Equal top scores report all tied keys. Direct-intent concepts unsupported
by the selected composition remain unresolved, even when another catalog
feature recognizes them. The independent ProposalAdmission model refuses stale
intent/catalog, ambiguity, unresolved concepts and composition constraints.
No routing result grants effects. This is an explicit-relation, R4-compatible
adaptation, not an imported learned R4 implementation or general language claim.

The versioned protocol carries typed intent, context, registry, semantic
relations and composition policy. It returns ranked candidates, selected closure,
ambiguity/unresolved evidence and the independent admission result. Requests are
bounded to 32768 hexadecimal payload bytes; responses to 4096 bytes. Existing
work/event/interaction protocols retain their own narrower decoding boundaries.

## Prior-art relationship

UOR-Foundation/uor-r4 at `999cdc087e67c58c8de0a6ce8dac2333f744a7b3`
separates grounded semantics, facet coordinates, routing and operator relations.
Its exploratory router does not establish this product's feature relevance.
This implementation adopts explicit semantic relationships and a replaceable
proposal contract without importing the unpublished research dependency or its
claims. LexLean R4 and Rule 30 inform finite integer execution and falsifiable
controls; Verdant Resonance informs multidomain candidates; compression informs
the distinction between identity and semantic relevance.

## Acceptance status

Registration and a missing-test failure preceded implementation. Twenty-two
finite model proof controls and eight protocol controls are defined. Six protocol
controls operate on parsed words; raw empty/noncanonical controls retain declared
`Quot.sound` and `propext`. The protocol diagnostic verifies seven modules with
receipt `6cc78a93480bd2c6dd06263c6a5b241a32c3829171b38b95a6111574e9714203`.
The full 18-module graph diagnostic verifies (receipt `59398ea339acd752ae0554d8706119e371544e4c444bdb573428b2d1c750ad49`). Diagnostic tooling does not replace the
exact SDK.

Thirty-two independent wire vectors include ambiguity, unsupported intent,
source/registry staleness, policy refusals, 32 candidates and a 32-feature
transitive dependency chain. They extend embedded guest acceptance from 145 to
177. The previous installed guest correctly refuses the new runtime gate.
Six codec controls cover exact representations, bounds, caller capture, malformed
output and actual host wiring. Six codec defects are rejected and restored. All 290 local Node controls, workspace Rust tests and Clippy pass.

Review exposed a semantic defect in the initial approach: recognizing a concept
somewhere in the registry did not ensure that the selected composition supported
it. The model now checks selected-composition support and has a dedicated proof
and wire control. A compiler pattern limitation required reconstructing the
matched list in the insertion branch; no compiler or SDK substitution was made.
Long word fixtures are factored into bounded append expressions for the canonical
semantic-IR parser.

`routing-qualification.json` fixes twelve author-curated typed-intent judgments
separate from relationship definitions and proof/wire fixtures. Its thresholds
are exact judgments, zero false admissions/dependency mismatches, normal-request
p95 at most 100 ms and maximum corpus request at most 1000 ms. They are fixed
before measurement. This is independent literal-oracle evaluation, not independent
human labeling. Measurements, signed installation, browser replay, independent
reproduction and final exact-head SDK/Studio acceptance remain outstanding.

Natural-language interpretation, product discovery/creation integration, learned
R4 replacement, general relevance, complete feature semantics and release
qualification remain distinct obligations.

The initial signed build 43092373604 rejected list-returning helper calls as
intermediate values during production code generation. Helpers now carry owned
lists inside typed records, using the existing SDK representation. All finite
model obligations remain unchanged and pass after this representation change.
The selected-composition mutation is rejected by its concrete Lean obligation;
restoring the model restores verification. No SDK implementation is replaced.
