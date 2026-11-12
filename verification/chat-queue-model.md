# Bounded chat queue transitions and wire protocol

Authority: `ChatQueue.boundary`, `ChatQueueProtocol.boundary` (FA-50).
The actual `forge:queue` adapter serializes typed requests and delegates every
state transition to the signed guest. It does not implement queue policy in
JavaScript.

A queue contains at most 32 unique positive uint32 turn identities, including
any active head. Every successful mutation increments its revision. Enqueue,
remove, reorder, edit, clear, pause, resume, Stop, claim, completion, recovery and
failure are explicit operations with canonical unused fields. Active work stays
at the head; clear preserves it. Stale revision, owner and Stop policy cannot
mutate state. Failure or explicit recovery retains the item and pauses dispatch.
A recovering host must first establish abandonment under an exclusive origin
lock; the pure model does not authenticate a caller or establish that fact.

The versioned uint32 wire format has a 512-byte hexadecimal payload bound,
strict complete consumption and typed failures. It extends guest acceptance
from 177 to 215 vectors. Existing routing qualification remains mandatory for
the larger guest. This protocol grants no inference, persistence, publication
or payload authenticity authority.

## Evidence and scope

Registration, scenario and a missing-test failure preceded implementation.
Twenty-four concrete semantic obligations and eight protocol obligations are
present. Six protocol controls work on parsed words; two raw controls retain
explicit `Quot.sound` and `propext`. The six-module diagnostic verifies with
receipt `2065d214acf3c9e634faa969bb44d49a2f7747b38f08453b4ffea4066d0dd438`.
This is diagnostic tooling, not exact-SDK acceptance.

Thirty-eight independent literal wire vectors cover all operations, refusal
classes, maximum queues and malformed encodings. All 302 local Node controls,
workspace tests and Clippy pass. Six codec mutations reject list-bound removal,
uint validation removal, delayed caller capture, trailing output, invalid active
ownership and runtime error substitution; restoration passes.

The 19-module executable graph diagnostic verifies with receipt
`c27cd6b73dfd05c32a8661346a5fcab25497baa8a9db5b1757571d6dda1d512d`.
Four semantic mutations remove revision, owner, Stop-policy and active-item
checks; each fails its concrete Lean obligation and the restored model verifies.
Signed artifact construction/reproduction, actual guest/browser execution and
final exact-head SDK/Studio acceptance remain pending. Durable prompt/payload storage, actor
integration, actual queue dispatch/cancellation and crash recovery remain a
separate required implementation; existing renderer acknowledgements are not
claimed complete by this component. Neither production release hold is removed.

The router SDK failure exposed flattened generated helper symbols. A source audit found the queue protocol also reused `WorkProtocol.encodeResult`; it now uses the unique name `encodeQueueResult`. This changes no wire representation or expected state. The queue signed build must include both unique helper fixes.

Signed build 43099516534 at `f3aa9460a8204edc263fd86e6688a1d9f230f81b` passed construction. The archive signature verifies against the exact repository, workflow and source; wrong-source and changed-byte controls refuse. All 215 embedded vectors replay, and the independent routing corpus and fixed relevance/latency thresholds pass. Chromium document and dedicated-worker replay also pass the routing, composition, work, event and interaction corpora plus all 38 queue wire cases. See `kernel-artifact-receipt.json` for exact identities and measurements. The independent reproduction build and final full SDK/Studio acceptance remain pending.

Independent SDK rebuild 43104362539 at the same frozen source produced the identical complete 646392-byte archive (SHA-256 `40dc6013ce18cf421f8146f0449b32bd2baff7ede0e5783f1cb49b405f9640a5`). Both provenance bundles verify for the exact source and workflow, with self-hosted runners denied. This is component reproducibility, not complete application release acceptance.

The queue-specific reproduction records are retained in `historical/chat-queue-kernel-reproduction.json` and `historical/chat-queue-kernel-reproduction.sigstore.json`; the current top-level kernel reproduction record describes the later version-preview artifact. Neither historical artifact qualifies the combined backlog-integration kernel.
