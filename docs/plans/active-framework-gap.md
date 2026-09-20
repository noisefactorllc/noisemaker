# Active Framework Gap: GAP-030

Status: closed

## Gap

**GAP-030 — MRT budget adaptation does not invalidate same-size backend textures whose format no longer matches the graph.**

Exact problem statement from `llms-full.txt`:

> MRT budget adaptation does not invalidate same-size backend textures whose format no longer matches the graph.

Agent consequence:

> After resize or hot recompilation the graph can report `rgba16f` while the backend still allocates `rgba32f`. Byte-budget validation must inspect backend records and an unsupported FBO can still be created.

## Source Files and Observed Behavior

- `shaders/src/runtime/pipeline.js`: `applyMrtFormatBudget()` can demote a graph texture from `rgba32f` or `rgba32float` to `rgba16f` before allocation.
- `shaders/src/runtime/pipeline.js`: `createSurfaces()` reuses an existing double-buffered global surface when width and height match, without comparing the backend texture format with the graph texture format.
- `shaders/src/runtime/pipeline.js`: `recreateTextures()` reuses an existing regular texture when width, height, and, for 3D textures, depth match, without comparing format.
- `shaders/tests/test_mrt_format_budget.js`: existing coverage proves cold allocation uses the demoted format, but does not exercise same-size reuse after the required format changes.
- Observed before implementation: after a same-size re-evaluation changes an MRT attachment spec from `rgba32f` to `rgba16f`, the graph reports `rgba16f` while the existing backend texture remains `rgba32f`.

## Backward-Compatibility Contract

- Preserve DSL parsing, validation, expansion, saved programs, step indexes, and public result shapes.
- Preserve texture reuse when dimensions, depth, and format still match so persistent simulation state is not reset unnecessarily.
- Preserve current format-selection and MRT-demotion policy; only invalidate allocations that no longer match the already-selected graph format.
- Preserve runtime defaults and rendered output intent. The change must prevent invalid/stale allocations rather than introduce a new authoring behavior.
- Do not change effect definitions, shader source, production bundles, or backend capability thresholds.

## Objective Completion Criteria

- A same-size double-buffered global surface is recreated when its graph format changes.
- A same-size regular 2D texture is recreated when its graph format changes.
- A same-size regular 3D texture is recreated when its graph format changes while unchanged matching allocations remain reusable.
- Focused regression tests demonstrate the pre-fix mismatch and pass after the implementation.
- Required shader language/runtime suites, non-parity JavaScript checks, and lint pass.
- The exact pushed commit passes all required GitHub Actions checks triggered for the changed paths.

## Required Tests and CI Checks

- `node shaders/tests/test_mrt_format_budget.js`
- `npm run test:shaders:lang`
- `npm run test:shaders:runtime`
- `node scripts/run-js-tests.js --skip-parity`
- `npm run lint`
- GitHub Actions checks for the exact pushed commit, including the Shaders, JavaScript, Docs site, Site, and Downstream workflows when triggered.

## Bounded Work Items

- [x] Add focused regressions for same-size global, regular 2D, and regular 3D format changes, and verify that they fail for the stale-format behavior.
- [x] Make pipeline texture reuse require matching format in addition to the existing dimension and depth checks.
- [x] Review the complete diff, run all required checks, and fix actionable findings.
- [x] Update `llms-full.txt` only after evidence proves GAP-030 is closed.
- [x] Commit only this run's files, rebase, push normally, and verify required CI for the exact pushed commit.

## Completed Evidence

- Checkout safety: `git status --short --branch` reported `## main...origin/main` with no working-tree changes and no active Git operation.
- Initial synchronization: `git pull --rebase` fast-forwarded `main` from `6956bfec` to `72971c02` without conflicts.
- Target selection: the previous GAP-023 record was closed before this scheduled run. GAP-030 is repository-owned, correctness-focused, and bounded to allocation reuse plus existing MRT-budget regression coverage.
- Shade MCP availability check: no Shade MCP tool is exposed in this run. GAP-030 changes pipeline allocation bookkeeping rather than an effect definition or shader program, so repository unit/integration checks are the applicable executable evidence.
- Initial focused regression: `node shaders/tests/test_mrt_format_budget.js` exited `1`. The new cases proved that same-size global, regular 2D, and regular 3D allocations remained `rgba32f` after their graph specs changed to `rgba16f`.
- Review follow-up red test: the strengthened focused suite exited `1` because `recreateTextures()` accepted an `rgba16f` read texture paired with a stale `rgba32f` write texture.
- Implementation: global surface reuse in both `createSurfaces()` and `recreateTextures()` now requires matching read/write width, height, and format. Regular texture reuse requires matching width, height, format, and existing 3D depth.
- Focused regression after both fixes: `node shaders/tests/test_mrt_format_budget.js` exited `0` with 7 passed and 0 failed. It also proves matching allocations remain stable instead of being recreated unnecessarily.
- Adjacent checks: `node shaders/tests/test_pipeline.js` exited `0` with 22 pipeline cases; `node shaders/tests/test_volumesize_runtime_update.js` exited `0` with 7 cases; `node shaders/tests/test_volumesize_device_clamp.js` exited `0` with 6 cases.
- Independent diff review found two important issues: validate both global ping-pong halves in `recreateTextures()` and assert exact read/write allocations in the regression. Both were fixed. Re-review found no remaining behavioral issue; its final minor comment findings were also corrected.
- Shader language suite: `npm run test:shaders:lang` exited `0`, including the 7-case focused MRT suite.
- Shader runtime suite: `npm run test:shaders:runtime` exited `0`.
- Non-parity JavaScript suite: `node scripts/run-js-tests.js --skip-parity` exited `0`.
- Lint: `npm run lint` exited `0` with no diagnostics.
- Final local verification after review fixes: the shader language suite, shader runtime suite, non-parity JavaScript suite, and lint all exited `0` on the committed source.
- Implementation commit: `6e0166ceea2be30bd1032c11748d817cc7f6e34f` (`fix: refresh textures when formats change`).
- Pre-push synchronization: `git pull --rebase` reported `Current branch main is up to date.` The tested source did not change.
- Push: the normal `git push origin main` advanced `main` from `72971c02` to `6e0166ce`.
- Exact-commit CI: GitHub Actions run `35498504791` (`Shaders`) completed successfully. Shader tests, GPU tests, the shader bundle, the library-release dispatch, and the static-site-release dispatch passed.
- Exact-commit CI: runs `35498504823` (`Docs site`) and `35498504794` (`Downstream`) completed successfully. No JavaScript or Site workflow was triggered for this path set.
- Register closeout: `llms-full.txt` now records GAP-030 as closed, removes it from the open-gap table, and updates the open count from 29 to 28.

## Remaining Work

None. All GAP-030 completion criteria passed. Select the next gap only in a later scheduled run.
