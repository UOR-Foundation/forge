# PM-01: Foundry is one Prism model

Foundry is now one full Prism model, like every app it builds. Its behavior is still the kernel in
`app/src`. The other facets are projected from what Foundry already declares, by the builder's
projector, which is prism-devrel's builder brought into the studio at `studio/shell/prism/builder`.

| Facet | Module | Written from |
| --- | --- | --- |
| Architecture (ISO/IEC/IEEE 42010) | `app/src/Architecture.lex.tex` | the stakeholders, concerns, components and edges in `app/product.json` |
| Design (UML component, sequence and state machine) | `app/src/Design.lex.tex` | the build-phase state machine comes from the kernel's own `rule1`..`rule5`, `judge` and phase and event constants; the component view from the architecture; the sequence from `app/product.json` |
| Features and journeys | `app/src/Features.lex.tex` | each feature names the kernel declarations that realize it and the theorems that accept it, and carries its register IDs from `model/ids.toml` |
| Security and threat model (ISO/IEC 27034, 27005, STRIDE) | `app/src/Security.lex.tex` | the threats in `app/product.json`; a proof control cites a kernel theorem, such as `ForgeKernelProofs::denyWinsHolds` |
| Quality (ISO/IEC 25010:2023) | `app/src/Quality.lex.tex` | every kernel budget (`budgetOf`, 18 journeys) and experience rule (`narrowBreakpoint`, `motionMaximum`, `tapMinimum`) |
| Compliance | `app/src/Compliance.lex.tex` | the ISO obligations, and each `FoundrySpecification::Obligation` with its requirement text |

`node studio/tools/foundry_model.mjs` writes the facets, the shared Foundation and Production modules
and language packages (from the builder's assets, which the apps it builds carry too), and the
entrypoints in `app/lexlean.toml`. `just app` runs it with `--check` before anything is proved, so a
stale facet fails the gate. `just model-write` runs it too.

The budgets still live only in the kernel. The SDK reads a quality threshold as a literal (PP2001), so
each threshold is written as the kernel's value. Its theorem is then `thresholdOf i (measureRecords) =
(ForgeKernel::budgetOf (ForgeKernel::journeyX))`, which the Lean kernel checks. A changed budget fails
`prismpm verify` until the facets are written again.

## Checks run

- `prismpm check --project app` in the SDK image `prismpm.lock` pins: passed (semantic ID
  `d0eb4486…`). The SDK's design check (PP2012) and feature checks (PP2014 to PP2018) found real
  problems while this was built, and each one is fixed in the projector or `app/product.json`: a process
  sent to a component that does not own it, a message with no edge, and an acceptance row that named a
  theorem rather than a definition.
- `lexlean fmt --check` and `lexlean lock --check`: canonical, current.
- `cargo run -p xtask -- validate` inside the SDK image: every gate passed, `audit-reuse` included.
- `cargo test -p repo-conformance`: every suite passes, PM-01 included.

## Planted defects

| Defect | Gate | Diagnostic | Restored |
| --- | --- | --- | --- |
| The INP threshold theorem pinned to the literal `450` instead of the kernel's term | `product_model_pm_01` | `no threshold theorem names the kernel's term = (ForgeKernel::budgetOf (ForgeKernel::journeyInp)))` | passes |
| The same edit, by hand | `node studio/tools/foundry_model.mjs --check` in `just app` | `app/src/Quality.lex.tex differ from what app/product.json and app/src project` | passes |
| The publish commit drops the Security facet | `node --test studio/tools/builder_commit.test.mjs` | `Security is written` | passes |

## Apps the studio builds

`studio/shell/host.js` `publishCommit` now passes prism-code's commit (`templateCommit`, still held
byte for byte by the Template gate) through `prism/builder/commit.mjs`. The builder writes the same
app from one `prism/prompt/1` whose app is the spec, and adds every other facet with the claims their
theorems make. The template instance's own gate then proves the whole model. A builder-generated app
(the parking-fee fixture) passes `prismpm check` in Foundry's SDK image once relocked for its compiler.
