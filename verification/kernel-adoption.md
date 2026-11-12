# Kernel reproduction and adoption coordination (FA86)

The authoritative behavior and refusal constructors are registered in
`app/src/FoundrySpecification.lex.tex`, `model/ids.tsv`, and
`features/suites/kernel-adoption.feature`. This document describes how to operate
and qualify that boundary. Component reproduction does **not** qualify a release.

## Existing construction contract, bounded inputs

`build.yml` still invokes the immutable SDK and `just app`. For Foundry's app/
path it first materializes a new workspace from the exact event commit:

- Every tracked root file, every app/ file, and every .cargo/ file, including
  byte lengths, SHA-256 digests and Git executable modes.
- The exact build workflow and construction helper are separately bound as
  contract inputs. The platform is linux/amd64; the SDK must name a full digest.
- The full source commit and Git tree are recorded separately from the reusable
  input digest. Workflow source, checkout HEAD and construction helper bytes must
  agree. No generated input directories, symlinks or external path escapes are
  admitted.
- Only that workspace is mounted as repository input. Original shell and
  verification subtrees are unavailable to the SDK. A future need for another
  subtree fails until the explicit construction contract expands. Checks before
  and after construction validate every declared input and reject undeclared
  output outside app/.prism, app/.lexlean, app/.lake, .prism-proof and its log.
- No restored build or proof output is used. Two distinct run IDs, artifact IDs
  and signed invocation IDs are required, not two attempts of the same run.
  Ref-aware concurrency permits the two immutable replica refs to run in parallel.

This is a bounded repository workspace, **not a hermetic build**. The locked SDK,
its imported dependencies, hosted runner, and Docker socket remain trust inputs.
Generic prism/ and repository-root build modes retain their existing construction
path and are not silently granted kernel-adoption eligibility.

A signed artifact manifest covers every build file, build.json and build-inputs.json.
Only the manifest itself and its detached Sigstore bundle are excluded from that
manifest; the attestation signs both the manifest and the complete holo. Hidden
files are uploaded too: omitting generated .cargo configuration would make the
SDK manifest incomplete. Historical holo-only artifacts are not an adoption
fallback.

## Verification and preparation

Install the locked production verifier:

```sh
npm ci --prefix studio/tools/kernel-adoption --ignore-scripts --no-audit --no-fund
```

An existing authenticated GitHub CLI account or the official workflow's scoped
token is needed for API reads and requested actions. The coordinator never creates
credentials or changes persistent grants. It uses actual `gh attestation verify`
with exact repository, signer workflow, source and signer digests, OIDC issuer,
hosted-runner policy and verified signed timestamps. It then uses the locked
prism-code 0.7.2 remote verifier and replays every nonempty acceptance vector.

ZIP ingestion rejects duplicate entries, traversal, absolute paths, symlinks,
collisions, damaged CRCs, malformed headers and bounded extraction/ratio violations.
Both complete artifact and SDK manifests are checked. The compiler's source,
project configuration and lock entries must match captured source bytes. The two
complete holo files must be byte-for-byte equal, not merely share a guest digest.

From a reviewed checkout with the target branch fetched, plan is the default and
changes neither local nor remote state:

```sh
node studio/tools/kernel_adoption.mjs --source <full-commit> --target main
```

A committed component receipt can propose an older attested source only when its
full bounded input digest and immutable SDK equal the requested source and the
original source belongs to target history. The plan explicitly names both
`requestedSource` and actual signed `source`. That candidate is not trusted:
recovery verifies both original executions, live artifact records and full ZIP
digests again. Provenance is never relabeled to a newer shell-only commit.

Use a durable state directory outside the source checkout:

```sh
node studio/tools/kernel_adoption.mjs --mode build --source <full-commit> --target main --state /path/to/state
node studio/tools/kernel_adoption.mjs --mode prepare --source <full-commit> --target main --state /path/to/state
```

`build` recovers eligible signed executions or creates exact-source immutable
`prism/build/reproduce-<source>-a` and `-b` refs and explicitly dispatches build.yml
at them. This is required because pushes authenticated with GITHUB_TOKEN do not
trigger ordinary push workflows. A dispatch journal is saved before the action;
uncertain dispatches are inspected, not blindly repeated. Existing successful
runs whose artifacts expired are not treated as reusable results. A failed or
unresolved dispatch can require inspection and a new deliberate state directory.

`prepare` never requests new builds. It verifies two available replicas and
creates an isolated named branch/worktree. New archive bytes are committed first.
The second commit writes the immutable URL naming that archive commit, regenerates
the existing guest and metadata, and retains both signed bundles, build records,
input identities, manifests and the existing component-reproduction/1 receipt.
If the exact bytes already exist in target history, no empty archive commit is
invented. Repeated preparation rechecks the receipt, original signed inputs,
archive URL's Git object, guest bytes and metadata before returning a no-op.
Identical input closure after adoption or a shell-only change can reuse the pair
and remain a no-op. Expired or inaccessible artifacts fail closed; this version
requires recoverable original ZIPs for fresh verification, even though signatures
and manifests are retained in Git.

Explicit publication uses the same state and complete verification again:

```sh
node studio/tools/kernel_adoption.mjs --mode publish --source <full-commit> --target main --state /path/to/state
```

It reconstructs the deterministic prepared commits rather than trusting a writable
journal. It proves the final commit descends from the captured target and uses an
exact old-OID lease as an atomic compare-and-swap to the fixed authorized Foundry
repository. The lease cannot authorize any non-fast-forward history change.
A changed target is refused. A lost push response is reconciled by reading the
actual remote target before any further attempt. Arbitrary origin/pushurl settings
cannot redirect publication.

## Workflow behavior and maintainer duties

Previously, a main push automatically built, pinned and deployed the kernel.
Now a relevant main push prepares reviewed signed evidence and an adoption bundle;
it does **not** silently publish or deploy. A manual dispatch defaults to a
read-only plan job with only contents-read permission. Build/preparation has its
own write-scoped job restricted to the actual main event revision. There is no
privileged workflow_run handler and no execution of a supplied branch checkout.

The authorized maintainer automation/agent owns the next action. This separation
does not add a new user-approval requirement or turn prepared artifacts into an
endpoint: review the prepared commit/evidence, explicitly dispatch publish when
appropriate, and finish the full acceptance and deployment qualification. The
component receipt records those next duties and `releaseQualified: false`.
Full exact-SDK `just vv`, Studio/browser/performance gates, and independently
verified live deployment remain separate, mandatory release work. No component
receipt or successful pin is a substitute for those outcomes.

## Qualification and negative controls

`node --test studio/tools/kernel_adoption.test.mjs` has 60 mandatory tests,
including real locked prism-code replay of the committed kernel's 305 vectors,
changed archive rejection, exact closure changes, SDK/source/signer failures,
manifest and ZIP attacks, independent replica failures, stale projections and
URLs, deterministic two-commit preparation, cross-source same-input no-op,
wrong destination protection, ancestry/lease controls and uncertain outcomes.
The suite verifies its own unfiltered mandatory Studio/Rust registration. The
Rust wrapper installs the locked production closure in a clean SDK checkout;
Studio installs it explicitly before the unconditional suite.

Three production defects were planted separately, using the full suite each time:

| Planted defect | Required failure |
| --- | --- |
| Replace complete holo equality with true | `FA86 differing complete signed holo bytes refused` failed |
| Bypass publication ancestry proof | `FA86 publication refuses non-descendant even with matching target` failed |
| Replace exact expected-OID lease with generic force | `FA86 publication proves ancestry and pins exact lease and destination` failed |

Each mutant exited 1; restoring the production code returned 60/60 tests, no
skips, todos or cancellations. Independent review also exercised a real local
Git lease: fast-forward accepted, concurrent target advance to an included
ancestor refused as stale, non-descendant refused, and lost-success response
reconciled once. No remote write was needed for those controls.

The retained historical source 1ce5b07bcb43c97ac3b04bc90988a2f6ca1af90f,
run 43253866653, was independently checked with actual GitHub CLI 2.103.3.
The real verification JSON passed this coordinator's certificate-field checker.
Wrong source, repository, workflow, OIDC issuer and one changed archive byte each
failed real cryptographic verification with exit 1. This validates the actual
verifier boundary, not historical adoption: the old artifacts do not have the
new signed complete-manifest format.

A fresh hosted two-run positive check is required before the rewritten workflow
is declared qualified. It must prove bounded-workspace SDK construction, complete
hidden-file upload, new-format signature verification, independent full archive
comparison and isolated preparation against that exact candidate. Local tests do
not assert that this hosted qualification or final release acceptance happened.
