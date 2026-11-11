# Publication cancellation evidence

FA-04 implements `FoundrySpecification.publicationEffectsBoundary` and the six
`PublicationEffectError` constructors as an explicitly checked browser adapter.
Registration, scenario and failing conformance test preceded implementation.

The UI's abort signal now reaches the GitHub client, all polling delays and live
artifact retrieval. The adapter checks cancellation before requests, passes an
abort signal to fetch, interrupts waits and prevents success after cancellation
around acceptance replay. The 30-second default request deadline covers response
body consumption as well as connection establishment. Invalid deadlines refuse
before network access. HTTP failures retain status for existing recovery behavior;
malformed successful JSON refuses instead of being treated as null. Error messages
do not include credentials, remote response bodies or thrown exception payloads.

Cancellation stops browser work. It does not roll back a created repository,
commit or submitted workflow, and does not cancel a GitHub job. The user-facing
message says so. Native abort is requested for an in-flight fetch; remote servers
may already have processed it. Existing workflow links and repeat-publication
behavior remain available. Durable work reservations and resumable ownership
receipts are not implemented by this boundary.

## Executed controls

Twelve Node tests exercise the shipped effects adapter and actual GitHub build
module: pre-cancellation, cancellation in flight, stalled fetch/body deadlines,
invalid deadlines, typed network/HTTP/JSON failures, successful JSON/raw bodies,
polling interruption, real build interruption before commit and UI signal wiring.
The build test uses deterministic HTTP responses and proves no commit request is
sent after cancellation; it creates no repository or external side effect.

Two planted defects were rejected independently:

- Replacing malformed JSON refusal with null success failed the malformed-response
  control with `Missing expected rejection`.
- Removing the signal passed into the real GitHub adapter failed the build
  cancellation control, because execution continued instead of returning cancelled.

Both changes were restored. All 38 Rust workspace tests passed, including the
ten host-boundary controls and twelve publication controls. All browser parse-goal
checks passed. The full locked-SDK acceptance gate is run unchanged in PR CI.

## Completeness review

Author review checked cancellation propagation, timer/listener cleanup, body-read
deadlines, cancellation precedence, HTTP status recovery, late fetch completion,
and the distinction between browser and remote work. Both injected mutation tests
were run against production source and restored. This self-review is not independent
approval. These checks do not establish permission admission, all provider response
schemas, complete browser journeys, durable resume accounting or remote cancellation.
