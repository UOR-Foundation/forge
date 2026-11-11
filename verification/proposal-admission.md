# Proposal admission

Authority: `ProposalAdmission.admitProposal` and `FeatureComposition.admitComposition`.
FA-18 exports a pure compiled library operation accepting a declared registry,
independently expected intent and registry revisions, a router proposal and a
composition policy. A proposal contains references rather than replacement
feature contracts. Resolution selects the exact registered key/version pair;
multiple distinct versions may exist in a registry, while duplicate pairs fail.

Unresolved ambiguity or constraints refuse acceptance. Selected references are
resolved in dependency order and passed through the authoritative composition
admission. Confidence in 0..10000 is syntax, not permission, evidence or resource
authority. Returned features come from the registry. Stale intent or registry
revisions, invalid registries, unknown references and composition refusals remain
separate typed failures.

The ID, scenario and failing test preceded implementation. Twenty-one finite Lean
controls cover valid low/high confidence, exact selection among multiple versions,
malformed declarations, stale revisions, unresolved issues, unknown versions,
duplicates, missing or reversed dependencies and confidence failing to bypass
permissions or budgets. The local diagnostic compiler verifies all eleven modules.
Replacing composition admission with unconditional success and ignoring requested
versions both fail the Lean kernel. The defects were restored.

The model does not authenticate the registry or prove user intent, execute an R4
router, qualify relevance/latency, establish evidence authenticity, generate UI or
perform effects. Those requirements remain separate. Full immutable-SDK acceptance
and author review are recorded at the feature PR revision; diagnostic compilation
is not that acceptance gate.
