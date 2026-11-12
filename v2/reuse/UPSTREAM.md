# What the verifier must offer for the cache to pay off

Mechanisms 1 and 2 save no proof time today. The hosted verifier takes a whole project and answers for the whole project: one edit means one full run (over 10 minutes for the probe; 20 to 30 minutes per round in this work). The model can say exactly which declarations are stale; nothing downstream can act on that yet. No reduction in proof time has been measured or is claimed.

For the cache to pay off, the LexLean toolchain (hosted service and `lexlean verify`) needs the following.

1. Check and verify one declaration. Input: the declaration's source and, for each dependency, either its source or a reference to an already-accepted result. Output: the verdict for that declaration only. Without this, a cache hit can skip nothing.
2. A published toolchain identity. A stable, versioned record of the compiler semantics id, the Lean toolchain, the lexicon package versions and the axiom policy, returned by `lexlean_profiles` and stamped on every result. Mechanism 1 puts it in every key; today it has to be assembled by hand.
3. A canonical declaration form. The exact bytes a declaration is addressed over, defined by the toolchain (for example its `semantic-module/2` data form, in a specified canonical serialization), so two tools address the same declaration identically. Today the model addresses its own framing of kind, name and body.
4. A per-declaration attestation. A signed or otherwise independently checkable statement binding: declaration address, toolchain identity, claim (checked or proved), the exact axiom set observed, and the verifier's identity. Mechanism 2 admits a record only when this can be re-derived by the caller; an attestation that only the server can vouch for would make the cache a trusted third party.
5. Accept a dependency's attestation as an input. Verifying a declaration should take its dependencies' attestations instead of re-elaborating them. This is what turns "only 1 of 200 declarations changed" into 1/200 of the work.
6. All axiom violations at once. `LLV7005` reports one theorem per run; each correction cost a full round here: eight rounds, 128 to 135, about 20 to 30 minutes each, of which six only corrected one axiom list or one statement. Reporting every observed axiom set in one run would remove most of those rounds, cache or not.
7. A content-addressed result lookup, consulted before work. If the hosted service itself keyed results by (declaration address, toolchain identity), identical declarations across users would be verified once ever. The admission rules in [src/ProofCache.lex.tex](src/ProofCache.lex.tex) are the client side of that contract.

Also found while doing this work, smaller:

- `linear_arithmetic` closes goals by `simp only [...]`, then `split`, then `omega`. A statement that compares a value with itself (`x =? x`) is rewritten to `True` and leaves `¬True`, which `omega` cannot use, so the proof fails with "No usable constraints found". Statements had to be restated over two values with the equality as a premise. Adding `not_true_eq_false` (and `eq_self_iff_true`) to the simp set would remove this trap.
- There is no tactic for induction. Properties over lists of any length (canonical ordering for n members, lookup in a table of any size) cannot be proved; they are proved here for fixed sizes and tested beyond. A structural induction tactic over `List` would close them.
- `admit` is refused as a declaration name (Lean keyword), as is `record` as a parameter name; the diagnostics say so clearly.
- A local `lexlean verify` in the pinned SDK image (`lexlean 0.3.0`, image `cd3b47d7…`) was tried as a faster loop. `lexlean check --all` accepted the five modules; `verify` refused in 7 s with `LLV7001`: the leanchecker identity probe expects an exact error line and elan printed two informational lines before it. Not pursued further.
