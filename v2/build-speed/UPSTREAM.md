# Upstream requests from the build-speed study

Each entry is precise enough to be a pull request description or an issue comment.
Measurements are from `v2/build-speed/logs/`, taken on 2026-11-12 in the SDK image `prismpm-sdk-candidate@sha256:cd3b47d7…` (SDK 0.3.0), Windows 11, Docker in WSL Ubuntu, 12 CPUs, 14 GB, with unrelated Lean and Rust builds from other projects on the same machine (load 3 to 9).
Before writing each one I checked PrismPM `main` (527cd583), the v0.4.0 tag and the LexLean issue tracker. Where the work already exists upstream, the entry cites it and adds only the measurement.

## 1. PrismPM: publish an SDK whose vendored LexLean has LexLean #466 (already tracked by LexLean #465, comment only)

Status upstream: LexLean #454 (open) reports the symptom; LexLean #465 (open) found the cause, six matcher-splitter declarations compiled twice by `compileRows`; LexLean #466 fixed it on `release/v0.4` (merge commit `bc71b33f`, 2026-11-11 05:03 UTC). The acceptance of #465 already says downstream stays blocked until PrismPM publishes a corrected SDK. Nothing new to request; post this measurement on #465.

Measured here:

- `lake env lean -j2 LexLeanRuntime/Laws.lean -o Laws.olean`: 6.1 s, peak RSS 0.68 GB, exit 0 (`logs/laws-j2-loaded.log`).
- Same command with `-c Laws.c`, as `lake build` runs it: the `.olean` is written within seconds, then 2 assertion panics and 128,998 `AssocList.get!` panics, each with a symbolized backtrace, 342 MB of output in 37 minutes, `Laws.c` still empty when I stopped it (`logs/laws-j2-c-loaded.watch.log`).
- Effect on an app: any module the application entrypoint imports that holds a `linear_arithmetic` or `law` proof imports `LexLeanRuntime.Laws`, so `application-lean` stages it and fails `PP5007: application-lean timed out` at 600 s.

Pin consequence for Foundry: PrismPM v0.4.0 vendors LexLean 0.4.0 pinned on 2026-10-27 (#371); its `vendor/lexlean/src/backend/core_v2.rs` has the old `compileRows`, byte for byte the one in the failing `Laws.lean`. Moving Foundry's pin to v0.4.0 would not fix this (read from source; the v0.4.0 image was not run).

## 2. PrismPM: compile the staged `LexLeanRuntime` modules without C emission, or ship them compiled

Problem: `run_native_compilation` builds the application workspace with `lake build PrismGenerated`. Lake 4.32 compiles every module with `-c`, including the staged runtime modules, whose C nothing reads: after the build PrismPM consumes only `.lake/build/lib/lean` through `LEAN_PATH` (`verification.rs`, the `export_env` after `lean4-prod-build`). Selecting `:olean` facets does not avoid it: `lake build LexLeanRuntime.Laws:olean` still emitted 3 C files and timed out at 300 s (`logs/olean-only.log`); `PrismGenerated:olean` is refused as an unknown `lean_lib` facet.

Request, either of:

- Ship the runtime modules' `.olean` files for the pinned toolchain in the SDK image, under the same digest discipline as the stdlib, and put them on `LEAN_PATH` instead of staging their sources as Lake roots. This also removes 6 to 9 s of Portable and Collections per verify (`portable+collections` in `logs/laws-*.log`).
- Or compile the staged runtime modules the way LexLean's verifier already does, `lean -R <root> -o <olean>` with no `-c`, and keep Lake for the project's own modules.

Acceptance: a planted runtime module whose C emission panics no longer reaches `application-lean`; the attestation and the holo bytes are unchanged for an app that does not import `Laws`.

This complements, and does not repeat, `docs/proposals/fast-verified-builds.md` §4 (proof blocks for the stdlib and Foundation modules); runtime modules are not named there.

## 3. PrismPM: name the stage and the last output on `PP5007`

Problem: the failure the author sees is the single line `PP5007: application-lean timed out`. The cause (a panic loop in one named module) was in the child's stderr, which PrismPM keeps as an excerpt in the error's messages but the CLI did not print. It took a separate diagnosis to find.

Request: print, with `PP5007`, the excerpt PrismPM already records (`failure_excerpt` of stdout and stderr), and for a Lake child the last `[n/m] Building <module>` line. Do not make the 600 s limit configurable: with #1 fixed the limit is not the problem, and a larger limit would only delay the same failure.

`PRISMPM_PROGRESS` (#585, commit 82162af8) postdates v0.4.0, so neither the pinned SDK nor v0.4.0 names stages; a 1-second process sampler (`bench/sample.sh`) stood in for it here. Proposal §5 (stage records with wall times) would replace the sampler.

## 4. PrismPM (lean4-prod codegen): two refusals an app author cannot foresee

Both were hit by the probe app once the Lean stage passed, each refused in under 100 s.

- `PP4102: list value cannot be rendered without allocating: view returns a list; its result cannot be used as an intermediate value` (`vendor/lean4-prod/rust/prod-codegen/src/lib.rs:197`). A function returning `List Node` consumed by another (`encodeNodes (view state)`) is refused. The error code's documented meaning is "generated application code mismatch", which does not describe this. Request: a dedicated diagnostic code naming the restriction, an entry in the LexLean authoring guide, and a `lexlean check`-time warning so the author learns it in seconds rather than after the Lean build.
- `application-cargo-check` E0428, `dispatch` defined twice: `Probe.dispatch` and `TextRequest.dispatch` are projected into one Rust namespace, and the wrapper `TextRequest.dispatch := Probe::dispatch value` was lowered to `loop { return Ok({ continue; }); }`, a self-loop. Request: qualify projected names by module (or refuse duplicate unqualified names at check time with a named diagnostic); add a regression with two modules that both define `dispatch`. No existing issue found (searched PrismPM and the organisation for the message text).

## 5. PrismPM: the Hologram oracle's cold compile dominates a verify; prebuild it (already proposed, comment only)

Status upstream: `docs/proposals/fast-verified-builds.md` decision 1 already asks whether the SDK-owned oracle harness should be prebuilt in the image. Add this measurement:

- In a split-layout probe verify on `/mnt/c`, the oracle's `cargo build` took 514 s and `cargo run` then recompiled for another 347 s before a SIGTERM ended it (`PP5301`), with `CARGO_BUILD_JOBS=2` and load 4 to 9. Everything else in the verify took about 200 s (`logs/sample-split-cold.log`, phases in REPORT.md).
- The oracle's target directory is `<project>/target/hologram-oracle`. For a Windows author that directory is on the 9p bridge `/mnt/c`, which is slow for the thousands of small files Cargo writes.

## 6. Per-declaration verification (no new request)

Already proposed: `fast-verified-builds.md` and LexLean #338, #343, #391. Foundry's ARCHITECTURE.md reaches the same conclusion. Nothing measured here adds to it.
