# FA-60 — Bounded browser guest execution

Authority: `FoundrySpecification.boundedKernelExecutionBoundary`, composed with `compositionHostBoundary`. Registration, scenario and missing-test failure preceded implementation.

The offline compiler failure was reproduced against the signed 245-case guest: Chromium reported `WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance` despite ample available RAM. Every replay vector created a fresh instance in the document isolate, leaving virtual memory reservations dependent on garbage collection. Browser execution now retains fresh instances inside workers that terminate after at most 16 requests. Replay retires its worker before dispatch is exposed. The queue permits at most 64 requests/64 MiB, each execution has a 30-second deadline, and worker failure terminates the isolate without poisoning subsequent requests. Browser worker absence refuses. No guest or compiler bytes change.

Six feature controls and the Rust wrapper pass. Seven planted defects in instance freshness, worker lifetime, queue capacity, replay retirement, caller capture, reply identity and required browser worker availability are rejected, followed by restored success. Clippy, formatting and parsing pass. The full local Node result is 360/362: the two inherited combined-guest/compact-fixture gates still require the pending 287-case executable.

Actual Chromium document and worker replay pass all 245 embedded vectors plus all preview, queue, routing, composition, work, event and interaction wire cases. The complete verified shell initializes its actual compiler offline after another full guest replay and 80 additional requests, transforms and bundles to 42, refuses invalid source, recovers after failed import, and reports zero page exceptions. The mandatory existing compiler journey now includes the repeated guest execution regression.

The two-module host diagnostic verifies at `47b4c288cb6014b16a7b48d9bcf9d74b94d0efc4406b27b832750d0e39300899`. This is not exact-SDK or combined-release acceptance. Fresh full CI, 287-case qualification, independent review and production/factory/release obligations remain open.
