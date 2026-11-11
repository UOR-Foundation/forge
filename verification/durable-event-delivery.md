# Durable event delivery (FA-40)

Authority: `app/src/FoundrySpecification.lex.tex::eventDeliveryBoundary` and
`EventDeliveryError`; semantic admission remains `EventAdmission` through the
signed `EventProtocol` guest.

Four host commands configure, deliver, read pending events and acknowledge the
head consumer delivery. Configuration probes guest admission without delivering
its example envelope. The journal binds the stored policy/contracts, generation
and sequence to the captured project source. Replacement requires a higher
generation and no pending work. Delivery uses stored context, never a caller's
replacement policy, and commits its envelope and next sequence together.
Pending work is bounded to 256 envelopes and one MiB; excess refuses rather than
dropping work. Changed source refuses new delivery but preserves pending reads
and acknowledgements. Project deletion removes its journal atomically.

The existing project transaction now compares both captured source and previous
journal before writing. It acknowledges only transaction completion. Ordered
consumer acknowledgement removes the head; repeating the most recent receipt
is idempotent. This acknowledges local receipt, not arbitrary effect execution,
exactly-once delivery, authenticated same-origin callers or autonomous consumers.

Registration, scenario and missing-oracle Rust failure preceded implementation.
Six Node controls cover guest delegation, private errors, source/configuration
bounds, ordered acknowledgement and copied inputs. A negative control exposed
property-order-sensitive consumer comparison; it now compares typed key/version
fields. Seven restored mutations fail: guest bypass, stale source admission,
queue overflow, wrong consumer, mutable envelope, pending-work replacement and
journal comparison bypass. The guest-bypass harness initially failed with a
TypeError; its assertion now explicitly detects missing guest execution. The
journal mutation fails actual browser acceptance with forced overlapping writes.

Real Chromium runs the actual bridge, host, signed guest and IndexedDB. Exactly
one overlapping writer consumes a sequence. Reload retains pending delivery;
wrong consumer and stale-source attempts refuse. Acknowledgement, duplicate
receipt and higher-generation configuration work. A barrier forces both writers
to observe the same journal and confirms transaction comparison. A late storage
abort leaves the envelope and sequence unchanged. Project deletion removes the
journal. No page exceptions occur. Full local combined Node/Rust/Clippy and
browser regression results are recorded in this feature's review; immutable-SDK
and Studio acceptance remain necessary before readiness. Local shell provenance
is diagnostic.
