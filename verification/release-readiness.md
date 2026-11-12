# Read-only release readiness and stack receipts

FA85 is registered in `app/src/FoundrySpecification.lex.tex`. This document
explains its project-owned adapter, not an additional authority for the claim.
`studio/tools/release_readiness.mjs` is a Node 24 CLI with no package dependency.
It reads GitHub metadata and emits a JSON receipt. It never approves, merges,
closes, deletes, changes a branch, starts a workflow, or executes PR code.

## Run the collector

From a trusted checkout of Foundry:

```sh
node studio/tools/release_readiness.mjs \
  --repo UOR-Foundation/foundry --pr 155 \
  --head 09e51539e65bcd357ee4630636fe3b36e2607353 \
  --base 3708fa9efe53afb98735160500a6f7d3bd925f03 \
  --policy /path/to/captured-policy.json \
  --output /path/to/new-receipt.json
```

The identities above are historical examples, not current instructions to merge.
Capture the current PR head and the target branch's live ref before invoking the
CLI. `--base` means that **live ref**, not the cached `base.sha` in a PR response.
The collector independently reads the target ref and default upstream ref before
and after collecting evidence. The original PR base SHA stays in the receipt.

Without `--output`, JSON goes to stdout. With `--output`, the collector creates a
new mode-0600 file and refuses to overwrite an existing receipt. A short report,
blockers, observed runs and exact stack dependencies go to stderr. Exit 0 means
the explicit source-metadata policy passed at the recorded observation; exit 1
means it did not; exit 2 means invalid invocation/input or an adapter failure.
None authorizes release or a repository mutation.

`GH_TOKEN`, then `GITHUB_TOKEN`, may supply an existing read credential. Without
either, public unauthenticated REST reads are attempted. Do not paste tokens into
arguments, policy files, receipts, or logs. The collector creates no credentials
and never requests wider access. A credential needs only the GitHub read access
needed for repository metadata, PRs/reviews, Actions/checks, branch rules and
reviewer permission queries. GraphQL review threads usually require an existing
authenticated credential. A forbidden, unavailable or incomplete mandatory read
is an explicit blocker, not evidence that the corresponding set is empty.

REST pagination follows every next link and validates advertised totals. GraphQL
paginates every review thread, including outdated unresolved threads. It only
requests the first comment's link per thread because comment bodies are not used
for resolution. Cross-origin next links, redirects, loops, malformed pages and
truncation fail closed. API errors are sanitized; response bodies and credential
headers are not placed in diagnostics.

## Explicit captured policy

The policy file is a **trusted operator input**, never discovered from a PR body,
check display name, workflow contribution, or contributor-supplied file. Bind it
to the requested repository, PR, source SHA, live base SHA and target ref. Review
its lane list against the project's applicable acceptance boundary. An example
shape, using deliberately synthetic fixture identities, is committed at
`studio/tools/fixtures/release-readiness/policy.json`.

Each lane specifies:

- An ID, upstream repository and exact workflow path.
- `event: "pull_request"`, `revision: "head"` or `"merge"`, the authorized GitHub
  App numeric ID, and every required job name.
- An optional captured `run_id` to resolve genuinely duplicate workflow runs.
  Without it, multiple matching runs fail rather than choosing the newest green.

`revision: "head"` asks for upstream **source metadata** qualification: a run's
repository/event/workflow, exact source SHA and PR association to the current
live base, its current attempt's complete successful required jobs, and matching
check IDs/suite/App/SHA/conclusions. A fork push, upstream push, old base or absent
PR association does not satisfy it. Status requirements separately bind context,
creator ID and exact SHA, selecting the latest unambiguous dated observation.
Required skipped, cancelled, neutral, failing, missing or ambiguous jobs fail.

GitHub's PR workflow-run/job/check `head_sha` commonly names the source head,
while the workflow checkout can use a synthetic merge SHA or another revision.
**Those metadata fields do not prove which checkout was executed.** Matching
merge parents prove ancestry, not checkout execution. This version collects no
trusted checkout receipt, so a policy requiring `revision: "merge"` fails closed
with that precise missing-evidence blocker. It does not silently weaken the
policy to source-only qualification. A separately modeled receipt producer and
verifier would be needed to establish executed current-base merge acceptance.

The receipt always makes this distinction explicit:

- `qualification_scope: "upstream_source_metadata"`;
- `current_base_execution_qualified: false`;
- `machine_qualified` describes only the captured source-metadata policy;
- `release_authorized: false`, `action: "report_only"`;
- `ready_for_owner_decision` is a disposition for the authorized maintenance
  owner, not an invented request for human approval or a release promise.

## GitHub review rules and independent technical review

Effective branch rules, the branch's protection state, and any applicable legacy
protection are read and repeated. A protected branch whose legacy protection is
not available is not assumed unprotected. Captured policy can strengthen but
cannot weaken observed required approvals or checks. Unsupported required rule
kinds (for example required deployments or required workflows), malformed rules,
and code-owner/last-pusher requirements without authoritative evidence fail
closed rather than being silently ignored.

`review.minimum_approvals` may be zero if the repository rules allow it. When
approvals are required, only each actor's latest still-effective decision counts,
for the exact head, by a non-author whose authoritative repository permission is
`write` or `admin`. A drive-by/read-only approval is recorded but cannot satisfy
the branch gate. Permission evidence unavailable for a needed approval fails
closed. A later comment does not undo an approval or changes-requested decision;
a dismissed approval does not count. Reviews and threads are repeated to reject
observed changes during collection.

Independent technical assessment is a **different** receipt field. A captured
assessment binds an actual review ID, reviewer, exact head/live base, review body
SHA-256 and exact review URL. The reviewer must be independent of the author and
listed in the policy's trusted reviewer roster. Author self-comments, changed
bodies, changed heads/bases, dismissed decisions and requested changes cannot be
relabeled independent approval. A nonempty body or green badge is not proof of
substantive review. `independent_review.proven_by_collector` is always false;
`externally_attested` means the externally assessed evidence's identity matched,
not that this program judged the assessment's quality.

Missing technical assessment appears in `owner_evidence`. It is a machine gate
only when the explicit policy sets `review.require_technical_assessment: true`.
No external approval is invented when neither repository rules nor policy
requires one. Unresolved threads always block this collector's qualification.

## Ancestry, stacks and durable evidence

The JSON retains raw captured API records, page source URLs, policy content and
SHA-256, evidence SHA-256, timestamps, expected and observed identities, historical
PR base, individual lane results, reviewer eligibility, and precise links.
GitHub compare relations, not filenames, titles, patch similarity or truncated
commit lists, determine ancestry. An exact source ancestor of current upstream
is `exact_head_already_integrated`; a merged PR whose recorded merge commit is
an exact upstream ancestor is separately `recorded_merge_already_integrated`.
Divergence stays `divergent_requires_reconciliation`. An open stack parent is
identified by repository/ref plus an exact parent-head-to-child-head comparison,
with its PR link, and is reported as `stacked_on_open_pr` when applicable.
No disposition closes, deletes or retargets a stale PR automatically.

A receipt is a timestamped observation, not an atomic GitHub transaction or a
signed attestation. State can change after the final read. Recollect before an
owner acts. JSON hashes detect accidental changes when compared with an already
trusted receipt; they do not authenticate a contributor-supplied snapshot.

To replay an independently retained raw evidence object:

```sh
node studio/tools/release_readiness.mjs \
  --snapshot studio/tools/fixtures/release-readiness/qualified.json \
  --policy studio/tools/fixtures/release-readiness/policy.json
```

Replay does not access GitHub. It preserves the original capture time and is
labeled `collection_mode: "offline_replay"`, `live_observation: false` in JSON and
stderr. A replayed passing reduction is not a fresh live readiness observation.
For a collected receipt, extract its `evidence` object first. The reducer
`reduceReadiness(evidence, policy)` is pure; `collectEvidence(api, request)` owns
read-only I/O; `GitHubApi` owns transport and pagination.

## Failure vocabulary and verification

The registered failures are `readinessInputInvalid`,
`readinessEvidenceUnavailable`, `readinessIdentityChanged`,
`readinessPolicyInvalid`, `readinessLaneMissing`,
`readinessEvidenceAmbiguous`, `readinessJobUnqualified`,
`readinessReviewRequired`, `readinessThreadsUnresolved`, and
`readinessAncestryUnknown`. Each has a negative control in the Node suite.

```sh
node --test --test-reporter=tap studio/tools/release_readiness.test.mjs
```

The complete suite currently has 84 tests, all passed with zero skipped, todo or
cancelled cases. The Rust conformance wrapper requires the exact complete TAP
counts; the mandatory Studio step names this suite without a test-name filter.
The suite inspects its own registration for skip/todo/only and runner filters.
Fixture transport tests exercise paginated checks, statuses, reviews, workflow
runs, jobs, stacks and GraphQL threads, plus complete collection and CLI replay.

R3 red: before implementation, the full Node command failed with
`ERR_MODULE_NOT_FOUND` for the production `release_readiness.mjs` target. The
registered Rust wrapper was independently run red before that implementation.

R3 mutation: temporarily replace the production predicate
`job.conclusion !== 'success'` with `false`. The full Node command exited 1:
`required skipped job fails closed`, `required cancelled job fails closed`,
`required neutral job fails closed`, `required failure job fails closed`, and
`required null job fails closed` all rejected the planted defect. Restoring the
production file restored the full passing suite. No mutant is committed.

Historical live read-only exercise on 2026-11-12, with no GitHub mutations:

- PR [#154](https://github.com/UOR-Foundation/foundry/pull/154): live main
  `4afe38af26b5408e0f390b4746a474a8f2e37890` differed from cached PR base
  `69cdf26ea16ecf745e32004a807a2c8de1e61b37`; exact source diverged from live
  upstream. Source-head bootstrap run
  [43243012130](https://github.com/UOR-Foundation/foundry/actions/runs/43243012130)
  was retained as successful but lacked a current exact base association. The
  requested Studio lane was missing.
- PR [#155](https://github.com/UOR-Foundation/foundry/pull/155): open parent #154
  head `3708fa9efe53afb98735160500a6f7d3bd925f03` was an exact source ancestor.
  Several upstream source-head lanes had exact PR associations and succeeded;
  Studio run
  [43250388115](https://github.com/UOR-Foundation/foundry/actions/runs/43250388115)
  failed. The PR was draft at observation.
- Public REST reads worked, but the attempted GraphQL thread reads returned
  HTTP 403. Both receipts therefore failed closed instead of asserting that no
  unresolved threads existed. These observations are historical, not current
  release qualification.

The complete normative repository gate remains `just vv` in the exact locked SDK
image. Passing the adapter's Node suite alone is not a `just vv` or release claim.
