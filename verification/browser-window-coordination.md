# FA-57 — Browser window coordination

Authority: `FoundrySpecification.windowCoordinationBoundary` and imported renderer window, chat and app-run transport schemas. Registration, scenario and missing-test failure preceded implementation.

Each document holds an exclusive origin Web Lock and fresh actor identity. Duplicated session storage obtains a distinct live session. Short journal locks serialize bounded IndexedDB compare-and-swap updates; request success cannot acknowledge an aborted transaction. Focus, visibility, tab ownership and interests are persisted. Live windows cannot claim the same tab identity. Query invalidation history is bounded to 256 entries; bootstrap recovers retained entries or explicit recovery scopes. Only allowlisted stream channels reach matching peer interests. Imported schemas validate relayed state, and snapshots preserve the receiving actor identity and local monotonic revision. Stale or malformed state cannot overwrite it. No credential or arbitrary-channel relay is admitted.

Seven Node controls cover duplicate sessions, ownership conflicts, captured inputs, capacity, malformed state, missing entities, failed commits, history gaps, interest routing, no echo, local actor identity and transaction completion. The complete local Node suite passes 343 controls. Six planted defects in duplicate sessions, ownership conflicts, history recovery, actor identity, stale snapshot rejection and late-abort acknowledgement are rejected; restored controls pass.

The actual two-tab browser journey passes with the host and IndexedDB: duplicated session replacement, exclusive tab ownership, peer chunks and snapshots, dispatch using the receiving actor identity, committed invalidation recovery and late-abort rollback, with zero page exceptions. The journey is mandatory in Studio CI.

This is cooperative same-origin coordination. It does not establish native window control, cross-origin authentication, tab transfer, or remote app-run effect ownership. Full exact-SDK and Studio acceptance and completeness review remain required. Production dependency, factory, independent quality and release holds remain open.
