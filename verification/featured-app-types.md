# Featured app declaration repair

This repairs the existing projected-renderer typecheck for the featured cards.
It adds no runtime behavior, model claim, compiler relaxation or dependency.
`studio/shell/featured-apps.mjs` remains the runtime source; its renderer bridge
only re-exports that source.

## Reproduction and repair

On unchanged PR #164 head `6a1202afc817608c4552cf6d335bfbd6413f561d`,
`node studio/vendor/dyad/hologram.typecheck.mjs` exited 1 with exactly one added
diagnostic and no rewrite failures:

```text
src/components/FeaturedAppShowcase.tsx:21 TS7016 Could not find a declaration file for module '../../hologram.featured-apps.mjs'.
```

`hologram.featured-apps.types.mjs` uses the existing lockfile's TypeScript 6.0.3
compiler to emit both declarations from the actual JavaScript exports. It checks
the loaded compiler version, checks JavaScript strictly, refuses diagnostic or
incomplete output, and excludes the existing declaration pair from module
resolution so stale declarations cannot determine their own replacement.
Generation is in memory until `--write` is explicitly requested. Regenerate with:

```sh
node studio/vendor/dyad/hologram.featured-apps.types.mjs --write
```

The projected typecheck first compares the committed declaration bytes against
that compiler output without writing anything. No `any`, error suppression,
ambient wildcard module or second handwritten card interface was introduced.

## Qualified checks, 2026-11-13

- The original full projected typecheck was red as shown above. After repair it
  exited 0: no errors added to Dyad's own 28 diagnostics, and every UI call
  rewritten for Radix. This is the existing relative typecheck, not a claim that
  upstream Dyad has no diagnostics.
- The new suite first failed because its generator was absent. Its CI wiring
  controls then failed with the five declaration controls green, because the
  mandatory steps and production freshness call had not yet been added.
- All seven completed controls pass with zero skipped, cancelled or TODO cases:
  `node --test studio/vendor/dyad/hologram.featured-apps.types.test.mjs`.
  They cover deterministic emission, each missing declaration, each stale
  declaration, source export-shape drift, broken re-exports and mandatory wiring.
- Each of the two production `.d.mts` files was separately removed, then
  separately replaced with stale bytes. The actual
  `node studio/vendor/dyad/hologram.typecheck.mjs` entrypoint exited 1 for all four
  planted defects, naming the missing or stale file. Each file was restored from
  its captured bytes; `--check` and the complete seven-control suite pass after
  restoration. Fixture tests repeat these mutations without touching production.
- Wiring mutants omit a required name, alter the prerequisite
  guard, filter the suite, change the target file, append `|| true`, or introduce
  `continue-on-error`. The audit refuses them. Missing, conditional and wrong-root
  production freshness calls are also refused. An unfiltered top-level suite
  integrity guard requires all seven registrations and rejects skip/only/TODO
  controls; a real `--test-name-pattern` invocation was refused.
- All four existing `studio/tools/backlog_workflows.test.mjs` controls pass,
  including the nine-command and 63-command acceptance-block checks.
- `node --check` passes for the generator, suite and typecheck entrypoint;
  `git diff --check` passes. The pinned formatter passes on the new scripts.
  The pinned linter reports no errors; its two warnings are on unchanged regex
  lines in the existing typecheck entrypoint.

## Acceptance boundary

Before this repair, the projected typecheck was only in the Pages workflow's
non-reused Studio build, not the pull-request Studio lane. Studio now runs the
full seven-control suite and the complete projected typecheck in separate
fail-closed steps beside the renderer-boundary checks. Both require
`!cancelled()` and successful `shell_closure` and `corpus` steps, so independent
failures remain visible without bypassing verified prerequisites. Existing
acceptance commands and branch protections are unchanged.

No browser/build acceptance or complete `just vv` result is claimed here. The
locked SDK tooling is unavailable in this local environment; CI must establish
the complete acceptance boundary. The visual2D shell and all runtime JavaScript
and TSX are unchanged by this repair.
