# Lean's elaborator in the tab: assessment

**Recommendation: do not build it now.** The kernel fits a phone; the elaborator, as LexLean uses it today, does not.
What decides it is not the code but the data: the tab would have to load about 360 MB of compiled library files
before it could read one line of a project. Keep the elaborator outside the tab as an untrusted prover, and remove
the reason it needs all of Lean first.

Nothing here was built. The sizes are read from the Lean 4.32.1 release and from this folder's kernel build; the
estimates are marked.

## What the elaborator would add

It closes the one gap the kernel cannot: today a new proof needs a prover somewhere (`prover/`), and a build job per
new proof. With the elaborator in the tab there is no job and no server of any kind.

It does not add trust. The kernel already judges every declaration, and the statement is bound by the tab's own
reading of the spec (`../serverless-prove/`). An elaborator in the tab makes proofs; it does not make them more
believed.

## What it costs

| | Kernel (built) | Elaborator |
| --- | --- | --- |
| Lean modules linked | 777 | 2,260 (`import Lean`) |
| Compiled code, as the release's IR | 30.6 MB | 342.6 MB, 11 times |
| WebAssembly module | 2.23 MB, 419 KB gzip | estimate 25 to 40 MB, 5 to 8 MB gzip, if it shrinks as the kernel did |
| Library data loaded before work starts | 25.7 MB export (4.07 MB gzip) | about 360 MB of `.olean` files: Init 98, Std 110, Lean 124, their `.server` parts 30 |
| Memory in the tab | 77 MB | not measured; at least the 360 MB, held in the heap since WebAssembly cannot map files |

- **Why all of Lean.** LexLean's runtime library begins `import Lean` (all three of its modules), and a project's
  proofs are tactic scripts: `simp only`, `split`, `omega`, `decide`. Those are the elaborator, the simplifier and
  the tactic framework, which is most of Lean.
- **The one browser build that exists** is of a 4.33.0-pre fork: 137 MB raw, 19.9 MB brotli, with threads and
  cross-origin isolation, which a static host such as GitHub Pages cannot provide. This folder's build shows the
  kernel's slice compiles without threads after a two-line patch; the same has not been tried for the elaborator,
  whose task system leans on threads far more.
- **Phones.** A tab on iOS is ended well below a gigabyte. 360 MB of data plus the elaborator's working memory is
  not a design that runs "in any browser".

## What would change the answer

1. **A runtime library that does not import Lean.** If LexLean's library imported only what its definitions use, the
   data to load would fall from about 360 MB toward the size of `Init`'s public part or less. This is the largest
   single lever, and it is LexLean's to pull.
2. **Proofs as terms, not tactics.** `../serverless-prove/` already makes reflexivity proofs and definition equations
   in the tab with no elaborator. A LexLean proof form that emits a kernel term directly (its upstream request 1)
   needs no tactic framework at all. Each form moved this way is one the tab can prove alone.
3. **A single-threaded elaborator build upstream** (Lean RFC #16134), at the pinned version.

With 1 and 2, the tab would need the kernel it has now and a term emitter, not the elaborator.

## Until then

The prover stays outside and stays untrusted: 21 to 32 s per project here, and a library pack of 7.4 MB. The tab's
part is what is built: address checks, Lean's kernel, the axiom report, and the verdict.
