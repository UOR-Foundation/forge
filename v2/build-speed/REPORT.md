# Prism holo build speed: report

Date: 2026-11-12. SDK image `ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b47d7…` (SDK 0.3.0, Lean 4.32.1), as `prismpm.lock` pins it.
Machine: Windows 11, Docker in WSL Ubuntu, 12 CPUs, 14 GB, 4 GB swap (2.3 GB in use).
The machine was never quiet. Every run had other work beside it that I did not start and did not stop: another session's `Laws.lean` diagnostic until about 02:15, a `lexlean verify` and `xtask check-production-export` of `~/src/MCP`, and LexLean Rust builds of another project. Load average 3 to 9; each run's log records it at start and end.

## Result

The first probe holo is built and checked.

| | |
| --- | --- |
| Holo | `v2/build-speed/holo/Counter probe.holo`, 21,079 bytes |
| sha256 | `c9a7389e55702843b00953cf4eca3d6d757d42fa201773dfc8701da5e8c5f588` |
| Archive fingerprint | `e7170adcb9420e46b75c001cbffc9e2a168cab6cef17b443401a4920f8b89117` (BLAKE3 of the body) |
| Attestation printed by `prismpm verify` | `c158b9389837dc913fcd0491bc5939de459fb7e1532de5af7ba123a8c76b91aa`, the same in both passing runs |
| `npx prism-code@0.7.2 vectors` | `14 of 14 vectors passed (holo, Counter probe, identities verified)` ([holo/vectors.txt](holo/vectors.txt)) |
| `npx prism-code@0.7.2 inspect` | footer, labels and cross-references ok; guest pure, no imports, capability set requests nothing; attestations: none ([holo/inspect.txt](holo/inspect.txt)) |
| Source | [probe-app-split](probe-app-split), built from a copy at `~/build-speed/probe-app-split` on WSL's disk |

Proved, by Lean, in that run: `resetClears` and `strideKeepsCount` for every state, as before. The two runs reproduced the same holo bytes. `inspect` shows "Attestations: none": the holo carries no signed provenance, because only the GitHub workflow signs.

The holo is of a changed copy of probe-app, not of probe-app itself. Three changes were needed. The responses are unchanged: all 14 acceptance vectors are the original ones.

1. Both theorems moved from `Probe` to a new module `ProbeProofs`, a second entrypoint that `TextRequest` does not import. This is the layout the Forge kernel already uses (`ForgeKernelProofs`). It fixes the timeout.
2. `encodeOutcome` calls a new `encodeView state`, which appends the encoded nodes directly, instead of `encodeNodes (view state)`. `view` stays. The code generator refuses a list passed between functions (`PP4102`).
3. `Probe.dispatch` is renamed `respond`. Two modules each defining `dispatch` produce one Rust namespace with two `dispatch` functions; the wrapper became a self-loop (`E0428`, `loop { return Ok({ continue; }); }`).

## Before and after: local stage times

Seconds, from a 1-second process sampler ([bench/sample.sh](bench/sample.sh)), because SDK 0.3.0 ignores `PRISMPM_PROGRESS`. Stage edges are within about 2 s. Logs: `logs/verify-<label>.log` and `logs/sample-<label>.log`.

| Stage | Before: probe-app, ext4, warm volume | After, first run: split, ext4, warm volume, cold oracle | After, second run: same, warm oracle | Split on /mnt/c, cold volume |
| --- | --- | --- | --- | --- |
| Setup and exporter seed admission | 33 | 100 (node 72) | 30 | 23 |
| Application Lean: runtime and generated modules, `prod-export` | over 599, then `PP5007` | 23 | 5 | 14 |
| Application Rust: crate, check, core-wasm | | 66 | 46 | 61 |
| LexLean verify: elaborate, replay, `leanchecker`, audit | | 41 | 34 | 96 |
| Hologram oracle: `cargo build`, `cargo run`, headless browser | | 226 | 40 | 514 build, then 347 rebuilding in `cargo run` before SIGTERM |
| Checks after the oracle and the second application build | | 110 | 102 | |
| Wall time | 634, failed `PP5007` | 566, passed | 257, passed | 1,078, failed `PP5301` |
| Log label | `baseline-ext4-warmvol` | `split-ext4-warmvol` | `split-ext4-warm` | `split-cold` |

Read across: the model layout turns a failure into a pass; a warm oracle target halves a passing run.

## Diagnosis of the 600 s failure

`Laws.lean` is not slow. Lean's C emitter loops on it.

- Measured: `lake env lean -j2 LexLeanRuntime/Laws.lean -o Laws.olean`, standalone in the pinned image, takes 6.1 s, peak RSS 0.68 GB. Profile: compilation 1.8 s, `.olean` serialization 0.4 s, import 0.6 s, interpretation 0.24 s, type checking 0.2 s (`logs/laws-j2-loaded.log`).
- Measured: the same command with `-c Laws.c`, which is how `lake build` invokes every module, writes the `.olean` within seconds. Then Lean asserts twice in `Lean.Compiler.LCNF.getImpureDeclIndices` (`i != 0`, `map.size == targets.size`) and panics 128,998 times in `AssocList.get!` (key not present), each panic with a symbolized backtrace. After 37 minutes it had written 342 MB of output and an empty `Laws.c`; I stopped it (`logs/laws-j2-c-loaded.watch.log`).
- Measured: Lake cannot be told to skip the C. `lake build LexLeanRuntime.Laws:olean` still emitted C files and hit my 300 s limit; `PrismGenerated:olean` is not a facet (`logs/olean-only.log`).
- Read: `Laws.lean` is staged into the application build only when an application module imports `LexLeanRuntime.Laws`. Any `linear_arithmetic` or `law` proof does. In probe-app the theorems are in `Probe`, which `TextRequest` imports; in the Forge kernel they are in `ForgeKernelProofs`, which nothing in the application imports. That is why the kernel builds on Actions with the same image and the probe never did.
- Read upstream: the cause is LexLean #465. `compileRows` compiles six matcher-splitter declarations twice, which breaks Lean's native declaration index. It is fixed by LexLean #466 (merged 2026-11-11), and LexLean #454 reports the same symptom.

Environment ruled out:

- WSL, `-j2`, the volume or throttling: no. The panic loop is deterministic Lean behaviour on this input, reproduced by #454 and #465 on other machines. CPU throttling was not measured.
- Memory: no. Peak 0.68 GB, with 1.5 GB free and swap available.
- Load: it slowed the panic loop at most. With no load the loop would still not finish in 600 s, since #454 counted 1,219 panics in 30 s on its machine, and this run reached 129,000 without ending.

Against PrismPM's 150 s of Lean per build on the same image: the chess referee in `fast-verified-builds.md` evidently never staged `Laws` in its application build (not checked, its sources are not here). The split probe's application Lean is 5 to 23 s, consistent with that figure once `Laws` is out.

Not established:

- How many panics the loop makes in total, or whether it ever ends.
- Why the cold ext4 run spent 72 s in the exporter seed admission (node) against 20 s in the warm run and 11 s on `/mnt/c`.
- What sent SIGTERM to `rustc` in the `/mnt/c` run's `cargo run` after 347 s, short of the 600 s run limit.
- Whether the probe would pass on a quiet machine without the layout change: no, by the mechanism above, but I did not run it on a quiet machine.

## Levers tried, one at a time where the machine allowed

| Lever | Measured effect | Keep |
| --- | --- | --- |
| Theorems in a module the application entrypoint does not import | 634 s fail to 566 s pass (ext4, warm volume) | Yes. The only change that makes the probe build in this SDK |
| Project on WSL's ext4 disk instead of `/mnt/c` | LexLean verify 96 to 41 s; oracle `cargo build` 514 to 226 s (oracle total); a failed run became a pass. Confounded: the /mnt/c run had a cold volume and load up to 9 | Yes |
| Keep the project directory between runs (`target/hologram-oracle`, 1.9 GB) | 566 to 257 s, identical holo | Yes |
| Cache volume at `/tmp` instead of the 2 GB tmpfs | Not isolated here; PrismPM measured 814 against 317 s on the same image and machine type | Yes, on PrismPM's measurement |
| Environment variables to `prismpm` | None reach the build: children run with `env_clear()` and only PATH, ELAN_*, RUSTUP_*, CARGO_HOME, HOME and XDG_CACHE_HOME pass. `LEAN_NUM_THREADS=2`, `-j2` and `CARGO_BUILD_JOBS=2` are fixed inside | Nothing to set |
| `prism-code setup --local` | Configures the docker command, the image pull, the per-image volume and LF endings; nothing else | Its volume, yes |
| One build at a time | Every verify of mine ran alone; other projects' work could not be stopped | Yes |
| WSL resource settings (`.wslconfig`) | Not tried: applying them restarts WSL, which would stop containers and builds I did not start | Not established |
| SDK v0.4.0 | Not run (5.7 GB). Its vendored LexLean has the old `compileRows`, so the timeout would remain | No help for this failure |

## Recommended local setup

1. Lay out every app with its theorems in a proofs module that the application entrypoint does not import, listed as a second entrypoint (entrypoints sorted):

   ```toml
   entrypoints = ["src/ProbeProofs.lex.tex", "src/TextRequest.lex.tex"]
   ```

   Also: give each module's request handler a distinct name, and never pass a `List` from one function to another on the dispatch path.

2. Keep the app on WSL's own disk, and give the image its cache volume once:

   ```bash
   wsl -d Ubuntu
   ```

   ```bash
   mkdir -p ~/apps && cp -r /mnt/c/Users/pavel/Desktop/HOLOGRAM/forge-spec/v2/build-speed/probe-app-split ~/apps/probe
   ```

   ```bash
   docker volume create prism-sdk-cache-cd3b47d7a370
   ```

3. Verify from that directory, one build at a time, and do not delete `target/` between runs:

   ```bash
   cd ~/apps/probe && npx prism-code@0.7.2 verify
   ```

   The measured runs used [bench/verify.sh](bench/verify.sh), which passes the same `docker run` arguments as `prism-code`'s `dockerArguments` with the cache volume, and runs `lexlean lock && lexlean fmt --all && lexlean lock && prismpm verify`. `prism-code verify` itself was not timed here.

Expected, from the measurements above: about 9.5 minutes for a first verify, about 4.5 minutes after, on this machine under similar load.

## GitHub Actions

Measured from recent runs (`gh run view`):

| Run | Runner | Image pull | `prismpm verify` | Note |
| --- | --- | --- | --- | --- |
| pages 43133564374, main | ubuntu-24.04 | 190 s | 502 s | Forge kernel, 12 modules |
| bootstrap 43133564443, main | ubuntu-24.04 | 136 s | about 497 s inside `just vv` | same commit, proved again |
| bootstrap 43133564443, main | ubuntu-24.04-arm | 144 s | `just vv` 675 s in all | slower than amd64 |
| build 43118735269 | ubuntu-24.04 | 141 s | 1,683 s | a larger kernel on a `prism/build/` branch |

Where the time goes there: the image pull (about a quarter of a run) and `prismpm verify`. Logs show no per-stage times. The same main commit is proved three times: pages, bootstrap amd64 and bootstrap arm.

Proposed: [app-build.proposed.yml](app-build.proposed.yml), not installed. Its design:

- An `address` job on a bare runner hashes the SDK image digest and every tracked file of the app, and looks the key up in the Actions cache without downloading. No image pull.
- On a pull request whose key was proved before, a `reuse` job restores that holo and its attestation id. Main and tags always prove in full, the rule `just app` already applies.
- Otherwise a `verify` job on `ubuntu-24.04` restores `target/hologram-oracle` keyed by the SDK image digest (the oracle harness is SDK-owned, so its compiled target depends on the image alone; Cargo's fingerprints still decide freshness, and the oracle still runs). It puts `/tmp` on the runner's disk instead of a tmpfs, runs the same `prismpm verify`, signs provenance, and saves the holo under its key.
- amd64, not arm, and the standard runner: PrismPM fixes Lean at two threads and Cargo at two jobs, so more cores are not expected to help (not measured).

Measured on GitHub, with your approval, in the public scratch repository [humuhumu33/prism-build-speed-scratch](https://github.com/humuhumu33/prism-build-speed-scratch). It holds the split probe as `app/` and this workflow unchanged, on `ubuntu-24.04`, one run each:

| Case | Run | Whole run | Image pull | `prismpm verify` | Note |
| --- | --- | --- | --- | --- | --- |
| Cold: push to main, empty caches | [43194362133](https://github.com/humuhumu33/prism-build-speed-scratch/actions/runs/43194362133) | 7 min 39 s | 159 s | 270 s | saved the oracle target (409 MB compressed) in 5 s |
| Warm: dispatch on main, oracle target cached | [43195612994](https://github.com/humuhumu33/prism-build-speed-scratch/actions/runs/43195612994) | 6 min 13 s | 167 s | 176 s | restored the cache in 4 s |
| Pull request, README only, same proof inputs | [43195689964](https://github.com/humuhumu33/prism-build-speed-scratch/actions/runs/43195689964) ([PR 1](https://github.com/humuhumu33/prism-build-speed-scratch/pull/1)) | 17 s | none | none | reused main's holo; prove job skipped |

All three runs reproduced the local build exactly: attestation `c158b938…` and holo sha256 `c9a7389e…`, now signed by the scratch repository's workflow. The hosted runner verifies faster than this loaded desktop: 270 s against 566 s cold, 176 s against 257 s warm.

Where the time goes now: the 5.5 GB image pull is about 40 to 45 percent of a run that proves. The oracle cache saves about 94 s per run. Nothing in the workflow can shorten the pull further: caching the image through the Actions cache would move as many bytes as pulling it from ghcr.io. Only a smaller image or a runner that keeps it (self-hosted) would.

Not measured on GitHub: arm runners, larger runners, and Foundry's kernel under this workflow.

## Upstream

[UPSTREAM.md](UPSTREAM.md). In short: the timeout's cause and fix already exist upstream (LexLean #465, #466); PrismPM needs an SDK carrying them. Ask PrismPM to compile runtime modules without C or ship them compiled, to print the stage and output on `PP5007`, and to fix the two code-generation refusals. Moving Foundry's pin to v0.4.0 would not fix the timeout.

## Measured, estimated, not established

Measured, by runs I made on this machine:

- `Laws.lean`: 6.1 s without C; a panic loop of 129,000 panics in 37 minutes with C; Lake cannot select olean-only.
- Full verifies: probe-app 634 s, `PP5007`; split on ext4 566 s and 257 s, both passing with one attestation and one holo; split on `/mnt/c` 1,078 s, `PP5301`. Stage times as tabled.
- The holo's digest and fingerprint, `vectors` 14 of 14, and the `inspect` output.
- GitHub run and step durations, from `gh run view`, for Foundry's recent runs and for the three runs of the proposed workflow in the scratch repository.

Read, from source or upstream, not run:

- `env_clear()` in PrismPM's child processes.
- v0.4.0's vendored `compileRows`.
- LexLean #454, #465 and #466.
- `PRISMPM_PROGRESS` landing after v0.4.0.

Estimated: the local "expected" figures.

Not established: the four items listed under the diagnosis; the effect of `.wslconfig`; the tmpfs-against-volume difference on this probe; whether `prism-code verify` matches `bench/verify.sh` in time; the proposed workflow on arm or larger runners, or on Foundry's kernel; run-to-run variance (one run per case).

## Files

- [probe-app-copy](probe-app-copy): probe-app unchanged (sources only), the "before".
- [probe-app-split](probe-app-split): the built variant.
- [bench](bench): the scripts that made every measurement; [logs](logs): their output.
- [holo](holo): the holo, its manifest, identities, and the `vectors` and `inspect` output.
