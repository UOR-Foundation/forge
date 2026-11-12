# Backlog integration verification

This integration preserves the existing captured-source and transactional commit boundaries while combining the application stack through #148 with main's stateful modules and #153's first-attempt thinking policy. It does not establish whole-product release acceptance.

## Stateful approval and proof completion

Main previously read a module and proof state independently, then recaptured the project immediately before writing their derived update. A concurrent edit could therefore become the basis of a stale state/proof write. `appStateOf` now reads both from one `captureProjectSource` snapshot. Approval and proof completion pass that same snapshot to `applyStoredProjectPatch`; its existing transaction refuses a competing revision. A proof already stale before starting sends no request. Conflict outcomes cannot be audited or displayed as accepted.

`node --test studio/tools/main_stateful_integration.test.mjs` executes the actual host boundary. The original-main control fails because no captured snapshot is retained. Two planted regressions replace the approval or completion snapshot with a fresh capture; the race tests reject both. Restored tests cover atomic capture, successful approval, raced approval, raced proof completion, and a stale source or phase before proof.

## Conflict resolution controls

The host retains Ask/Plan source-effect guards, exact provider routing, generation cancellation, and serialized text settlement while adding the stateful app flow. The Featherless thinking switch is encoded before the existing exact-request inference disclosure. Stateful preview prefixes, repair checks, final checks and final preview share one disclosed hosted-source session for the captured app and turn. Its ownership callback checks the captured project before and after requests, advances only to snapshots returned by this turn's successful transactions, and closes after pending preview work settles. Ask and Plan do not create that session.

The focused Node run covered stateful CAS, inference effects, read-only chat, provider routing, generation patches, live app parsing/checking/proof, hosted-source permission and workflow inputs: 65 passed, zero failed, and two inherited real-hosted opt-in checks were skipped. JavaScript syntax checks and `git diff --check` also passed. Those results are not full SDK or browser qualification; the complete final gates remain required.
