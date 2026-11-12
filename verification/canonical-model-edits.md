# Atomic canonical file edits (FA-36)

Authority: `app/src/FoundrySpecification.lex.tex::canonicalEditBoundary`.
The ID/scenario and missing-oracle Rust failure preceded implementation.

The actual file-editor handler now prepares edits to prism/spec.json and the
active canonical decision module through the existing reader, checker and
renderer. Input is bounded to 1 MiB UTF8. A module edit preserves presentation
fields, and a first module must match its file name. Validated edits enter
rulesAfterTurn with the captured source; no separate raw file write occurs.
The existing transaction commits the model, authoring JSON, generated rule
runtime, source snapshot/version and rules state together. Model renames remove
only the prior active module in that transaction. Direct writes to the generated
rule runtime refuse for projects carrying a decision spec. Inactive modules and
ordinary files retain the generic atomic path.

Internal JSON tag wrappers escape less-than signs without changing decoded
metadata. An actual literal closing tag otherwise truncated the command; the
new regression failed before the fix. Source conflicts retain projectEditConflict
in the host envelope, with a fixed private message. Invalid canonical edits and
generated-projection writes likewise have modeled fixed typed refusals.

The actual browser exposed an existing response-contract defect: a successful
save returned warning:null, but the imported renderer accepts only an optional
string. Both generic and canonical saves now return the exact acknowledgement
shape. A second browser failure caught string deletion entries where the batch
adapter requires {path} records; the atomic rename uses the required records.
These failures were corrected, not treated as accepted runs.

Six Node controls cover actual module/JSON preparation, private refusals,
read-only projections, exact captured-source delegation, generated projections
and atomic rename. Seven planted defects are rejected: bypassed semantic
checking, enabled projection writes, dropped source binding, retained old
module, unescaped delimiter, null acknowledgement and lost conflict code.
Every mutation was restored. All 218 combined Node controls and local Rust
workspace/Clippy pass; shell parsing and formatting pass.

Real Chromium uses the built shell, actual renderer bridge, core, host and
IndexedDB. Ordinary saves acknowledge correctly. A module edit updates its JSON
and generated runtime, invalidates an explicitly seeded fixture proof, and
creates one version. Three refused edits leave storage unchanged. Rename and
literal closing-tag metadata remain coherent, and concurrent canonical saves
produce one winner and one typed conflict. No page exceptions occur. The seeded
proof is only a lifecycle fixture; no remote proof is requested or claimed.

This qualifies direct file-editor routes. Import/restore/generation authority,
general compiler preservation, non-decision applications and whole conversion
remain separate obligations. Full exact-head immutable-SDK and Studio acceptance
must pass before this feature is ready. Local shell provenance is diagnostic.
