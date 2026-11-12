# FA-58 — Verified working-tree queries

Authority: `FoundrySpecification.workingTreeBoundary`, composed with project source capture and snapshot restoration boundaries. Registration, scenario and missing-test failure preceded implementation.

Both working-tree queries now capture app, reference and file state in one completed readonly transaction, independently verify snapshot and file identities through core admission, and return exact captured differences. Missing or corrupt basis objects cannot become successful empty differences. Empty file presence, added/modified/deleted paths and newline-preserving minimal line counts are retained. Renames appear as deletion/addition. Bounds are 1000 files and 48 MiB per side, 100000 lines per file and four million comparison cells for a list query. Exhaustion is a typed refusal. File-diff queries return exact text without computing unrelated line statistics. Queries do not write state.

Six feature controls and the full 349-control local Node suite pass. Workspace Rust tests, Clippy, formatting and actual browser acceptance pass. The host/core/IndexedDB browser journey covers clean sealed source, changed source, empty files, separated line edits, exact text, corrupted snapshot refusal in both public queries and recovery, with zero page exceptions. It is mandatory in Studio.

Six planted defects—ignoring empty-file presence, skipping comparison budgets, allowing duplicate paths, bypassing verified basis reconstruction, aliasing mutable caller input and corrupting minimal line counts—are rejected; restored controls pass. The two-module host diagnostic verifies at `24bc48a5c8d947b528f432c38782d521e4556a014cae74868fb87526807ef803`; it is not locked-SDK acceptance. A malformed constructor record was corrected before this receipt.

Fresh exact-SDK and full Studio acceptance and completeness review remain required. Factory, production dependency closure, independent quality and whole-product release obligations remain open.
