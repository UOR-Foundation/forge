# Clean Pages replacement evidence

This is a containment release based on the last successfully deployed Foundry
source, `e7d1703a66138169ae5864ef27a3891f6fa181bb`. It is not the newer main
release and does not claim a complete Prism credential or consent model.
Application, kernel, Studio and Lighthouse policy bytes remain those of that
baseline. The new `FR-01` boundary is registered in `model/ids.toml`, with
artifact policy and typed diagnostics in `model/pages-release.json`.

## Model first

The ID, scenario and test preceded the export implementation. Running
`python3 -I -B bootstrap/test-pages-export.py` first failed all eight methods
with 20 expected assertions because the guard and release wiring were absent.
The exact locked SDK then ran `just model-write` and
`cargo run -q --locked -p xtask -- check-model` successfully in
[run 43093974942](https://github.com/UOR-Foundation/foundry/actions/runs/43093974942),
at source `9eceb7a4655b65aa8c9120cb647461ae6cb5a195` and tree
`a53887c462abf9ca0e55b9d7a844fe55afde7c39`.

The generated evidence artifact is `13890007097`, with archive SHA-256
`8ae1d6a205dba476f42f4113d60c2141674c1ca625046c1b38b4d86b8577bf34`.
Its original document, every receipt member, all 2,765 input-file hashes and
identical before/after input snapshots were independently checked. The actual
generated `CONFORMANCE.md`, SHA-256
`d55f3b79eb9495e37ce593bcd918deab27446139b2cf14e1f9f016102031fc90`,
was copied unchanged before the release implementation was applied.

## Export boundary and falsification

`bootstrap/pages-export.py` first inspects every recursive name and entry type,
including hidden files and the final combined `app/` tree, without reading file
content. It then hashes only single-link regular files and emits one complete
source-bound inventory after rechecking the tree. No partial inventory is
emitted after refusal.

| Diagnostic | Negative fixture |
| --- | --- |
| `PAGES_EXPORT_FORBIDDEN` | Empty `warmup.json` at root, nested shell, hidden path or `app/`; a directory or FIFO of that name |
| `PAGES_EXPORT_INVALID` | File/directory/dangling symlink, hard link, FIFO, missing root, or invalid inventory schema |
| `PAGES_EXPORT_EMPTY` | Empty export directory |
| `PAGES_EXPORT_CHANGED` | Inventory bytes or file membership differ from the same-run producer inventory |
| `PAGES_EXPORT_SOURCE` | Non-commit source identifier or producer from another source |

All fixtures are inert; no real credential file is downloaded, opened or copied.
The eight-test suite passes locally. Removing the forbidden-name predicate
produces six failing assertions. Marking one method skipped fails even when
unittest otherwise reports success; removing one method fails the required
count. Removing an artifact guard, either architecture, a required acceptance
job, Lighthouse, screens, the environment binding or final inventory comparison
fails the workflow checker. The production inventory-comparison program itself
rejects wrong schema/source, missing/duplicate members and path anomalies.
A changed ordinary file produces a different inventory and fails the same
`cmp` used immediately before Pages upload; restoring its bytes passes.
The Rust `FR-01` test requires both successful exit and the exact eight-test,
no-skips completion receipt, so a zero-test or omitted suite is not acceptance.

## Release conditions and effects

The exact containment branch triggers this release workflow. It checks the
complete `just vv` boundary on both original runner architectures, every
original Studio check, browser/identity/frame acceptance, and Codespace
acceptance. The build retains the original Lighthouse thresholds and screens.
All producer outputs are rebuilt, without restoring prior Actions artifacts,
page caches, lane caches or browser caches. Package/browser/lane work uses
fresh runner-temporary directories. Only artifacts produced in this same run
are assembled; their source-bound inventories must match the complete final
export immediately before upload. Source commit/tree/archive hashes and all
export inventories are retained as evidence.

The normal original release effects remain: the holo receives a GitHub/Sigstore
provenance attestation, and `bootstrap/page.mjs` can register its fingerprint,
public URL and name at `https://registry.uor.foundation/prism/register` with
short-lived GitHub OIDC. The unchanged `site/app.json` does not opt out of
indexing. There is no package/OCI publication or provider-key export. The Pages
job uses the existing `github-pages` environment and normal Pages permissions;
any protection refusal or approval wait must be respected, not bypassed.

Local source checks are not a complete release qualification: the exact-SDK,
Studio, browser, Codespace, Lighthouse and screens jobs still must pass on the
final committed source before deployment. A workflow or policy failure is a
blocker, never a reason to reduce a gate.

## Remaining credential risk

Removing the file prevents its inclusion in the new artifact. It does not
revoke keys, remove copies already downloaded, clear browser storage, or erase
credentials retained in an already-open page. The baseline client still has its
legacy missing-file fallback. Credential rotation remains an owner action.
After a permitted deployment, verify the new deployed source and artifact,
then check the removed endpoint with HEAD-only requests, including revalidation
and a fresh query, without retrieving its body. Browser cache behavior needs
separate authorized validation; file removal alone is not evidence of revocation.
