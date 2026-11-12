# Serve PrismPM's library at the SDK's pinned version as a hosted profile

Target: `UOR-Foundation/lexlean-mcp` (the gateway at `https://mcp.uor.foundation/`), with a companion change in `UOR-Foundation/PrismPM` that publishes the profile. Filed as https://github.com/UOR-Foundation/lexlean-mcp/issues/102 on 2026-11-12, with Foundry paths replaced by inline descriptions.

## Problem

The hosted `prism-app` profile cannot check a project that imports PrismPM's library, which is what every app built on `Foundation.View.Browser.V1` does.

Its `prism.arch` package holds 2 entries ("Text application model", "Bounded byte buffer"). The SDK image `prismpm-sdk-candidate@sha256:cd3b47d7…` ships `prism.arch` with 141 (`/opt/prismpm/share/conformance-root/language/prism.arch`). A module's `\title` must be read as phrases of the lexicon, so the library module `Foundation.View.Browser.V1.Model`, titled "Browser view model", is refused before any declaration is read:

```
LLL1004 `Browser` is not a phrase concept
src/Foundation/View/Browser/V1/Model.lex.tex:5:8-5:15
```

The same project passes `lexlean check --all` in the SDK image. PrismPM's own client already meets this: `prism-code` refuses, as `hosted.layout`, a project that names a lexicon package the profile does not carry.

Measured on 2026-11-12 (Foundry v2, `v2/hosted-check/`):

| Route | Verdict for a 93-line app plus the library | Time |
| --- | --- | --- |
| Hosted `prism-app`, sources as shipped | refused, `LLL1004` | 0.4 to 1.6 s |
| SDK image, `lexlean check --all` | checked | 11 to 29 s cold, of which 1.6 to 3.8 s is the check |
| Hosted, with SDK-only title phrases replaced (the workaround) | checked | median 0.56 to 0.99 s to the verdict, over two sets of 12 runs in a browser tab |

The workaround agrees with the image on 17 of 17 corpus files, code for code and position for position. But it rewrites the sources it sends, and it depends on an argument about the title rule rather than on the authority. A browser should be able to send the real files.

## Change

1. Add a profile, `prism-sdk-0.3.0` (name it after the SDK version it reproduces), provisioned with `gateway-provision init/lock/install` from the SDK image's own project layout:
   - `lexlean.toml` with `language = "1.2"`, source root `src`, and `lexicon_source` entries for `lexlean.std.nat` (builtin) and `prism.arch` (path).
   - `language/prism.arch`: the 141 entries, byte for byte from `/opt/prismpm/share/conformance-root/language/prism.arch` of the image the SDK release pins. Its review record names `prism.arch@1.0.0` and that tree's `tree_sha256`.
   - `src/Foundation/**`: the library modules from `/opt/prismpm/share/conformance-root/stdlib/src`, byte for byte, so a draft that imports `Foundation.View.Browser.V1.Model` resolves it without sending it. A draft may still send them; the gateway already lets a draft file replace a bundle file at its path.
   - No `Contract` entrypoint, or one that imports only library modules, so that a check of a draft does not depend on a module the author did not write.
2. Keep `prism-app` unchanged, so nothing that uses it today moves.
3. Report the profile's provenance in `lexlean_profiles`: the SDK version, the image digest, and the `tree_sha256` of each path package, so a client can refuse a profile that does not match the SDK its lock pins.

## What must stay in step when the SDK moves

The profile reproduces one SDK release. When PrismPM releases a new SDK (a new image digest in `prismpm.lock`):

- Add a new profile for the new version from that image; do not edit the old one in place. A project pins an SDK digest, and its checked or proved result must keep meaning the same thing. The profile ID already changes with every byte of `lexlean.toml`, the lock, and the lexicon files (PF-03), so an in-place edit is visible but still breaks every client pinned to the old one.
- The three things that must match the image: the `prism.arch` tree (`tree_sha256`), the library sources under `src/Foundation`, and the compiler. The first two are files and can be compared byte for byte; a gateway test should do that against the image, as `crates/model/tests/atlas` does for the Atlas profile.
- The compiler is the hard part. The gateway pins LexLean v0.4.0 (`.github/lexlean.rev`, `e0b74b8`); the SDK image of `prismpm.lock` in Foundry runs `lexlean 0.3.0` (`compiler-semantics 8554008…`). The hosted snapshot reports `compiler_semantics_id 81a5f530…`. A profile carries files, not a compiler, so a profile named for SDK 0.3.0 would still be checked by the gateway's engine. Either serve each SDK profile with the engine of that SDK's LexLean, or state in the profile record which compiler checks it and that it differs from the SDK's. On 17 files the two compilers gave identical diagnostics, but that is a sample, not a guarantee.
- Retire a profile only after the SDK it reproduces is no longer pinned by a released template.

## Acceptance

- `lexlean_check` with `profile: prism-sdk-0.3.0` and only `src/App.lex.tex` (Foundry's `v2/loop/answers/guests-2.lex.tex`) returns `success: true`.
- The 17 files of Foundry's `v2/hosted-check/corpus/`, sent unchanged, give the verdicts, codes, messages, lines and columns that `lexlean check --all` gives in the pinned image (recorded in `v2/hosted-check/image-results.json`).
- A planted change to one library file, or to one `prism.arch` entry, of the provisioned profile makes the byte comparison with the image fail.
- `lexlean_profiles` lists the SDK version and image digest for the profile.

## Out of scope

Proof. This asks only for the check. `lexlean_verify` on the same profile would follow, and `prism-code verify --lean --hosted` could then drop its layout guard for library projects.
