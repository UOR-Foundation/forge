# Canonical decision-module admission (FA-35)

Authority: `app/src/FoundrySpecification.lex.tex::canonicalModuleBoundary`.
The registered ID and scenario preceded the missing-oracle Rust failure and the
failing Node controls. This branch integrates the existing LL-01/LL-02 authoring
candidate from PR #59 with FA-01 through FA-34 and PR #69's runtime repairs.
PR #59 records that its original spike preceded its own registration; that
history is not restated as compliance with the required development order.

Review found that the reader could silently discard an extra definition,
unsupported Request field, additional bound or altered request argument. The
resulting simplified decision model could pass while differing from the supplied
module. Admission now reconstructs the canonical decision profile and compares
all non-theorem declarations and surrounding module text after whitespace
normalization. Duplicate declaration names refuse before reconstruction. The
reader accepts at most 1 MiB UTF8, 4096 declarations and 256 nested delimiters;
partial input also has the byte bound and remains an untrusted draft.

Supplied theorem text is not proof evidence: canonical output regenerates
proof declarations from the read properties. The reader returns the fixed
invalidCanonicalModule code/message without exposing parser/source diagnostics.
This conservative profile is not a general LexLean compiler or a general
semantic preservation proof. It does not complete source-authority convergence
for every editing/import route or for non-decision applications.

Six controls cover complete/proof-free round trips, whitespace, duplicate and
unrepresented declarations, unsupported/duplicate fields, altered projections,
extra bounds, changed arguments, size/nesting limits and private typed errors.
Four representative defects were planted and rejected by concrete assertions:
skipped reconstruction comparison, removed size bounds, ignored structures and
untyped turn failures. The source was restored after every mutation. The prompt
example gate was corrected to select the actual Example block; previously it
selected a prose tag mention and relied on the reader discarding that prefix.

All 212 combined Node controls and the Rust workspace/Clippy pass locally.
The original authoring suite retains exhaustive RSVP comparison over 10,521
requests, 20,000 interpreter comparisons, 584 streaming prefixes, and comparison
of 312 Verdant obligations against its 3,131,000-request table and 30 edited
copies. Its read-plus-obligations median is 10.4 ms against the unchanged 25 ms
budget; its observed p95 was 72.9 ms, which is not a tail-latency qualification.
The frame rebuild matches committed component bytes. Local Lean builds both
obligation theorems with exactly propext and Quot.sound; this is supplementary
host evidence, not the required locked-SDK acceptance.

Browser replay, full immutable-SDK acceptance and exact-head Studio acceptance
remain required. The parent event-capable signed guest is still being built.
No complete conversion, large-model SDK proof support, factory adoption or
production release acceptance is claimed.
