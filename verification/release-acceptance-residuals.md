# Delivered scope and remaining proposals

This is an evidence disposition record, not a second behavior model. Authority remains
`app/src/FoundrySpecification.lex.tex`. Observations below were rechecked on
2026-11-12 against the exact commits and linked sources. They do not qualify later
heads. No contribution is closed, moved, deleted or adopted by this record.

## Delivered main

[PR #69](https://github.com/UOR-Foundation/foundry/pull/69) delivered main
`4afe38af26b5408e0f390b4746a474a8f2e37890`, tree
`ee9370bcf400a295d3e01d8d13c7a94c3dde2d6f`, preserving FA-01 through FA-84 and AC-01.
This includes scoped hosted-source permission, source/lifecycle ownership, the
notation adapter and current-main integration. It does not include the three
proposals below. The [delivery receipt](https://github.com/UOR-Foundation/foundry/pull/69#issuecomment-6831456708)
records independently checked live source and kernel identity, successful live
preview, root HTTP 200 and private `warmup.json` HTTP 404.

Post-merge runs at that exact main commit are completed successfully:

- [Full immutable-SDK `just vv`, native amd64 and arm64](https://github.com/UOR-Foundation/foundry/actions/runs/43265852388).
- [Studio and browser acceptance](https://github.com/UOR-Foundation/foundry/actions/runs/43265853339).
- [Kernel consistency, with no replacement commit](https://github.com/UOR-Foundation/foundry/actions/runs/43265852321).
- [Signed Pages build, deployment and visitor-side live preview](https://github.com/UOR-Foundation/foundry/actions/runs/43265852346).
- [Canonical frame](https://github.com/UOR-Foundation/foundry/actions/runs/43265852285) and [codespace](https://github.com/UOR-Foundation/foundry/actions/runs/43265852359).

The six final PR workflows, including Forge performance and Prism Lighthouse,
are linked in #69's exact-head acceptance record for
`9345f5ba99d9f662ea9a258819e38462e389b9ef`. Earlier performance failures in feature
notes remain historical failures, not current blockers on the delivered merge.

The delivered kernel's `kernel-reproduction.json` binds two independent signed
builds of `1ce5b07bcb43c97ac3b04bc90988a2f6ca1af90f`: a 508,356-byte archive,
SHA-256 `20a3747bd84725469df2e930b529ec28603caffc351403249778ed3db6aca33b`,
305 embedded acceptance vectors and the separately executed large composition
controls. Component reproduction is not evidence for an unbounded whole-product
claim. New FA-85/86 automation changes need their own exact-head qualification;
the delivered merge's results cannot be borrowed for this candidate.

## Proposals retained without upstream acceptance

| Proposal and exact current head | Verified evidence and boundary | Acceptance still required |
| --- | --- | --- |
| [#73](https://github.com/UOR-Foundation/foundry/pull/73), `20c8a6652d0fbc6f7db33954fac7eb621c8f1b0a` | Open draft from `JH9384/Offline-Foundry`. [Fork verification 43244083344](https://github.com/JH9384/Offline-Foundry/actions/runs/43244083344) completed successfully on this exact head. The [review disposition](https://github.com/UOR-Foundation/foundry/pull/73#issuecomment-6830570508) preserves optional local-provider/offline generic React scope and the fork-only production DEFER boundary. This is not upstream CI or upstream product acceptance. | Reconcile the older PR-body CI status; agree the optional product scope and register it before implementation here. Qualify bounded transport, hosted-source permission and source/lifecycle compare-and-swap integration, real installation and rollback, then the full upstream SDK/browser/release boundary. Keep the canonical default unchanged unless separately accepted. |
| [#154](https://github.com/UOR-Foundation/foundry/pull/154), `3708fa9efe53afb98735160500a6f7d3bd925f03` | Open isolated `v2/in-tab-check/` research. The [review disposition](https://github.com/UOR-Foundation/foundry/pull/154#issuecomment-6830572074) found no production import and a clean extraction missing `dist/lexlean-tab.wasm`. Author-reported corpus agreement and timings remain historical experimental observations; green bootstrap is not execution of its 34 checker controls. | An independently reproducible immutable checker build, complete dependency/toolchain provenance, applicable native and browser acceptance, and explicit acceptance of any adopted scope. No served feature or proof capability follows from this experiment. |
| [#155](https://github.com/UOR-Foundation/foundry/pull/155), `09e51539e65bcd357ee4630636fe3b36e2607353` | Open draft based on #154, not main, with explicit **DO NOT MERGE / DO NOT DEPLOY**. [Studio run 43250388115](https://github.com/UOR-Foundation/foundry/actions/runs/43250388115) failed on this exact head; the [review disposition](https://github.com/UOR-Foundation/foundry/pull/155#issuecomment-6830573598) identifies missing `dist/lexlean-tab-lean.wasm`. | Resolve [LexLean #494](https://github.com/UOR-Foundation/LexLean/issues/494), [#495](https://github.com/UOR-Foundation/LexLean/issues/495) and the supported immutable SDK checker contract. Both issues remain open as checked. Reproduce the official checker, rebase onto delivered main preserving FA-83 hosted-fallback permission and FA-84 source/lifecycle authority, register behavior/errors/scenarios, then run complete SDK, browser and performance acceptance. No patched LexLean fork or historical experiment evidence substitutes for those gates. |

These are distinct proposals, not silently completed requirements and not a reason
to withhold the already-qualified delivered main scope. An open issue's status
alone cannot prove that its requested SDK contract has or has not been delivered;
future adoption must verify actual immutable SDK capability and bytes.

## Broader model requirements

The model's `scope` definition distinguishes required behavior from executed
acceptance. The older `application-contract-status.md` inventory retains broader
unaccepted requirements and historical feature evidence, including generalized
semantics, imported native capability gaps, complete production dependency
closure, accessibility/usability assessment and qualified factory integration.
This record does not invent implementations, waive those obligations, or claim
that finite main delivery proves every application requirement. Evaluate each
future proposal against the model and its own exact input and release scope.
