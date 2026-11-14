# FA-51 — Durable chat queue adapter

Authority: `FoundrySpecification.durableChatQueueBoundary`, with state transitions owned by `ChatQueue.transitionQueue` and `ChatQueueProtocol.dispatchQueue`. Imported renderer schemas and payload serialization come from the locked upstream source through a reproducible browser bundle. This projection is not a Prism compiler.

The adapter persists captured intents and guest state together, acknowledges only after transaction completion, checks compare-and-swap and chat/app existence, bounds recent duplicate receipts to 128, and removes journals atomically with chat/project deletion. Separate origin Web Locks protect short mutations and active execution. Busy submission queues rather than disappearing. Stop binds the current invocation, changes durable policy before signalling cancellation, and retains pending work paused. Recovery retains an abandoned head paused for explicit resumption.

## Local evidence

The registered ID, scenario and missing-test failure precede implementation (`durable-chat-queue-red.log` in the execution evidence workspace). The local 308-test Node suite, workspace Rust conformance suite, Clippy and formatting checks pass. Six new Node controls cover imported source hashes, canonical payload hashes, capture before awaiting, tampering, literal guest-wire fixtures, editing/reordering/removal/clear, duplicate intent conflict, stale revision/Stop/owner refusal, corrupt journals, transaction completion/late abort/CAS/deletion, recovery and concurrent submission/Stop during an active turn. The controller trace has literal expected states; it is not a handwritten transition implementation and does not substitute for actual guest acceptance.

Eight planted defects were rejected by `node --test studio/tools/durable_chat_queue.test.mjs`: omit payload hash validation; omit stored identity validation; accept changed replay content; bypass transaction CAS; resolve before transaction completion; ignore caller revision; omit abandoned-owner recovery; ignore cancellation invocation. Each mutation was restored; all six controls then passed. Logs are `durable-queue-mutation-*.log` in the execution evidence workspace.

The imported schema projection reproduces exactly from 87 compiler inputs. `CHAT_CONTRACTS_LOCK.json` binds the generator, package lock, compiler version, input hashes, output hash and license. The Studio lane must reproduce it from installed locked dependencies. SDK tests independently bind committed imported source and output bytes without depending on a host compiler.

A host-tool diagnostic verified the specification's two-module graph, receipt `e0ab7d4c7ea8bd5fd731d83efa5679e7bcf9d13d18f900835f9538614df02fca`. This is diagnostic evidence only, not the locked SDK acceptance boundary.

## Outstanding acceptance

The installed queue guest is signed SDK build 43099516534 at source `f3aa9460a8204edc263fd86e6688a1d9f230f81b`, with 215 embedded cases and 38 queue wire cases. The actual-host browser gate passes two-page paused submission, edit/reorder/remove, stale revisions, reload, changed actor identity, clear and deletion. It also passes actual `chatTurn` with a controlled Featherless transport: submission while active, cross-page invocation-bound Stop, retained paused pending work, owner-page closure and paused recovery, explicit resumption, deletion during consent, and a real IndexedDB put-success/transaction-abort. No page exceptions occurred. The transport fixture does not call a real provider or establish provider-side cancellation.

The deletion journey first failed because committed deletion did not notify the active executor. Deletion now refreshes the local controller and broadcasts to peers after transaction completion. The same journey then passed. The refreshed Node suite passed all 308 tests before that host-only notification fix; focused and final CI checks validate the final head. No general exactly-once guarantee, independent approval, factory qualification or release acceptance is claimed.

The full locked-SDK `just vv`, actual guest/runtime/browser gates and final completeness review remain required. Queue payload preservation does not by itself establish complete semantics for every imported chat mode, attachment or selected-component field.
