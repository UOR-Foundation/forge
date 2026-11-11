# Rule lifecycle source binding

FA-09 realizes `FoundrySpecification.rulesSourceBoundary` and its typed
`RulesBindingError` boundary. Registration, scenario and a failing test preceded
implementation. Cached status previously named a source identity without
recomputing it when read, and publication could promote a captured state after
an edit or restore. Imported rule metadata could also supply an arbitrary proof
phase without local checking.

The browser storage adapter captures source and state in one readonly
transaction and recomputes the source identity. A status write checks that
identity and then compares the exact source again inside the readwrite
transaction. Approval, proof and publication also compare the expected prior
state there. This closes changes during hashing and competing completion races.
Caller-owned next state and expected state are captured before asynchronous work.
Imports retain files but discard untrusted approval/proof/publication metadata.

Six Node controls run in the Rust conformance gate. They execute the actual host
approval, proof and publication functions with controlled boundaries, including
stale publication refusal before preview promotion. Chromium executes the shipped
adapter against real IndexedDB and checks stale reads, edits during hashing,
competing state changes, restore invalidation, valid transitions and caller
mutation isolation. This browser control is required by Studio CI alongside
snapshot rollback acceptance.

Mutation evidence: removing the source comparison fails the browser source-race
check; removing expected-state comparison fails the competing-completion check;
ignoring the publication commit result fails the actual host publication test.
Restored Node/browser suites pass. Local Rust workspace tests, Clippy and shell
parsing pass. Diagnostic LexLean checking is not locked-SDK acceptance; the full
remote gate is required for this revision.

Author completeness review covered every host saveRules call, initial proof
startup, post-proof promotion, imported metadata, direct file edits, restore
invalidation and post-build publication status. A failed local verification or
stale-state promotion now explicitly says remote content may already be live.
This is an author review, not independent approval. These controls bind lifecycle
state to source; they do not authenticate the hosted prover or source-to-build
provenance, undo remote work, or establish complete application acceptance.

Review also found late publication progress overwriting the stopped message after
the shared abort handle was cleared. The added host-function regression failed
with two messages instead of one before the fix. Progress now checks its captured
controller and active-operation lifetime; an old operation cannot clear a newer
operation's abort handle.
