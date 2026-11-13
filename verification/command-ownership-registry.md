# Command ownership registry

Authority: `CommandRegistry.commandRegistryJson` and
`FoundrySpecification.commandRegistryBoundary`. Registered capability FA-43.

The literal canonical registry classifies 329 commands, including all 91
installed browser handlers, 310 imported input schemas and 306 output schemas.
These sets overlap. Each command names one versioned feature/owner, adapter,
contract origin and availability. Feature metadata records effect categories,
target and the limited inventory assurance scope. The JSON payload is a
project-owned declaration checked by LexLean; its adapter schema is checked by
the runtime validator. It is not a proof of arbitrary handler semantics.

The generated browser data must byte-match the literal model payload. The
project-specific projector extracts that payload only; it does not implement a
LexLean compiler or replace any SDK command. Browser dispatch refuses undeclared
commands, removed owned handlers and handlers installed for declared unavailable
commands before input parsing or effects. Declared unavailable commands retain
the existing typed refusal. A missing ownership binding is distinct from a
schema refusal or a successful empty result.

## Verification

Registration and the missing-oracle failure preceded implementation. Six Node
controls check projection and actual owner declaration names, malformed and
duplicate records, effect prevention, complete schema/handler inventories and
immutable admitted snapshots. All 260 Node controls pass locally. Existing
host-boundary VM tests now inject the real registry and use declared channels;
they still execute the actual dispatcher and its input/output validators.

The browser oracle independently enumerates the running host and renderer
schema tables. It verifies all four counts and exercises undeclared handlers,
removed handlers, implicit availability changes, declared unsupported commands
and a working platform command. The full gallery/garden journey also passes
through the registry with zero page exceptions.

Seven planted defects are rejected: duplicate feature acceptance, changed
owner acceptance, availability-check bypass, omitted input inventory comparison,
mutable admitted data, generated projection drift and actual host dispatch
bypass. The dispatch defect is caught in the real browser before any effect.

Final-head complete SDK and Studio acceptance are required before readiness.
This inventory does not establish all-command semantic completeness, permission,
authenticated work ownership, R4 relevance or whole-application release scope.
