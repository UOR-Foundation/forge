# Unavailable browser capability queries

Authority: `FoundrySpecification.unavailableBrowserQueries` and
`capabilityAvailabilityBoundary`. FA-15 removes 32 handlers that returned
fabricated status, empty resource lists or empty findings for behavior the browser
host does not implement. This includes security reviews, problem checks, tests,
external databases/deployment tools, local model servers, quota accounting,
media/theme/template catalogs and related reads.

Thirty of these queries appear in the imported renderer read inventory. Their
classification changes explicitly from required to unavailable in
`studio/model/host-read-scope.json`. No gate is relaxed: the scope checker still
rejects missing required handlers, returned unavailable handlers and unclassified
reads. The other two removed handlers are outside that read-site inventory.

Queries now use the existing typed `unsupportedChannel` / `not_found` envelope.
Both IPC entrypoints preserve the failure. The actual renderer client and its
query error/retry controls pass. This does not qualify every full renderer route,
implement excluded integrations, or establish a complete semantic-owner registry.

The feature began with its ID, scenario and failing test. Two Node controls bind
all 32 model declarations, the 30 read classifications and actual host dispatch;
the Rust gate requires both controls to run without skips. Reintroducing the
fabricated `check-problems` handler fails that gate. The restored suite, complete
local Rust workspace, Clippy, shell parser, read-scope check and renderer recovery
checks pass. Full locked-SDK and Studio qualification is recorded at the feature
PR revision.
