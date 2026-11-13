# FA-56 — Studio pull-request concurrency

Authority: `FoundrySpecification.studioConcurrencyBoundary` and its literal `studioConcurrencyYaml`. The project-owned workflow projects exactly that block and verifies it before executing the existing lane. The registered ID, scenario and missing-test failure preceded implementation.

GitHub Actions is the imported scheduler: https://docs.github.com/en/actions/using-jobs/using-concurrency. A PR uses `studio-pr-<number>` and permits cancellation; every other event uses its unique run ID and refuses cancellation. This removes superseded PR work without skipping a test, reusing a receipt or cancelling main acceptance. Universal bootstrap/template files are unchanged. The qualified PrismPM factory consumer and immutable SDK/template update remain required separately; this is not a substitute factory.

Local acceptance: 336 Node controls, workspace Rust, Clippy and formatting pass. Four controls compare the actual canonical projection, reject altered grouping/cancellation and missing/duplicate boundaries, reject absent/duplicate/malformed model literals, and retain the existing browser/closure lane. Planted projector defects that bypass drift rejection or allow a second overriding concurrency block are rejected. Restored controls pass.

Two-module host diagnostic receipt: `f5cbc1e440376ad0cabc2a6384d7afd110483d9062da632b4a597c1fef9f2eff`; this is not exact-SDK acceptance. Draft pending full SDK/Studio checks and observed GitHub scheduling at the final head. Existing application, factory and release holds remain.
