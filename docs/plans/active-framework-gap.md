# Active Framework Gap: GAP-028

Status: active

## Gap

**GAP-028 — Frame export has no terminal result or cancellation counter for accepted frames discarded by reconfigure or close.**

Exact problem statement from `llms-full.txt`:

> Frame export has no terminal result or cancellation counter for accepted frames discarded by reconfigure or close.

Agent consequence:

> Accepted work can lose its callback without incrementing `completed`, `failed`, or `dropped`, so a host cannot reconcile or selectively retry canceled frames.

## Source Files and Observed Behavior

- `shaders/src/runtime/frame-export.js`: `configure()` and `close()` release pending records through `_destroySlots()` or `_abandonSlots()` without updating any terminal counter.
- `shaders/src/runtime/frame-export.js`: `_release()` clears the callback, texture ID, timestamp, context, and pending state but does not distinguish completion, failure, or cancellation.
- `shaders/tests/test_frame_export.js`: close and backend-loss coverage proves callbacks are suppressed, but the normal-close expectation leaves two accepted pending frames absent from every terminal counter and backend-loss coverage has no stats assertion.
- Observed before implementation: after two accepted frames are closed, stats remain `{ accepted: 2, dropped: 0, completed: 0, failed: 0 }`; reconfiguration has the same accounting hole.

## Backward-Compatibility Contract

- Preserve DSL behavior, rendered output, defaults, saved programs, step indexes, and public result shapes.
- Preserve the existing `stats` object identity and its four fields: `accepted`, `dropped`, `completed`, and `failed`.
- Preserve enqueue acceptance/rejection, slot reuse, callback delivery, callback suppression during reconfigure/close, error reporting, destruction order, backend-loss abandonment, and terminal close behavior.
- Preserve the existing meanings of `completed` and `failed`.
- Count an accepted pending frame released by reconfigure, normal close, or backend-loss close as `dropped`; do not invoke its callback or report it as an adapter error.
- Do not add a second cancellation API, counter, callback shape, or compatibility alias.

## Objective Completion Criteria

- Every accepted frame released by reconfiguration or close receives exactly one terminal count in `dropped`.
- Reconfiguration drops pending frames before creating the replacement slot ring and the queue remains usable afterward.
- Normal close drops pending frames even when slot destruction throws, while still attempting every slot destruction and preserving the first destruction error.
- Backend-loss close drops pending frames without attempting GPU destruction.
- Completed and failed frames are not double-counted as dropped.
- Once no work remains, `accepted === completed + failed + dropped` for the exercised lifecycle paths.
- Focused regression tests demonstrate the pre-fix accounting hole and pass after the implementation.
- Required shader runtime, non-parity JavaScript, lint, and documentation checks pass.
- The exact pushed commit passes all required GitHub Actions checks triggered for the changed paths.

## Required Tests and CI Checks

- `node --test shaders/tests/test_frame_export.js`
- `npm run test:shaders:runtime`
- `node scripts/run-js-tests.js --skip-parity`
- `npm run lint`
- `node --test test/docs-static-paths.test.js` after changing `llms-full.txt`
- GitHub Actions checks for the exact pushed commit, including Shaders, JavaScript, Docs site, Site, and Downstream workflows when triggered.

## Bounded Work Items

- [x] Add focused regressions for reconfigure, normal close with a destruction error, and backend-loss close, and verify that they fail for the current missing terminal accounting.
- [x] Count each pending accepted record as dropped before reconfiguration or close releases it, without changing the public stats shape or callback/error semantics.
- [x] Review the complete diff, run all required checks, and fix actionable findings.
- [x] Update `llms-full.txt` only after evidence proves GAP-028 is closed.
- [ ] Commit only this run's files, rebase, push normally, and verify required CI for the exact pushed commit.

## Completed Evidence

- Checkout safety: `git status --short --branch` reported clean `main` tracking `origin/main`, with no active merge, rebase, cherry-pick, revert, or bisect operation.
- Initial synchronization: `git pull --rebase` fast-forwarded `main` from `b8332f16` to `15352d60` without conflicts.
- Target selection: the previous GAP-031 record was closed before this scheduled run. GAP-028 is repository-owned, reliability-focused, and bounded to the existing frame-export queue lifecycle and its focused tests.
- Root cause: `configure()` and both close paths clear pending records through `_destroySlots()` or `_abandonSlots()`, which call `_release()` without recording a terminal disposition.
- Shade MCP availability check: no Shade MCP tool is exposed in this run. GAP-028 changes queue lifecycle accounting rather than an effect definition or shader program, so repository runtime and JavaScript checks are the applicable executable evidence.
- Baseline focused suite: `node --test shaders/tests/test_frame_export.js` exited `0` with 14 passed and 0 failed before adding the missing cancellation assertions.
- Focused red run: `node --test shaders/tests/test_frame_export.js` exited `1` with the three new lifecycle assertions failing exactly because reconfigure, normal close, and backend-loss close left pending accepted frames at `dropped: 0`.
- Implementation: `FrameExportQueue._drop()` now increments `dropped` only while a record is pending and then uses the existing release path. Both slot destruction and backend-loss abandonment use that single cancellation path.
- Focused green run: `node --test shaders/tests/test_frame_export.js` exited `0` with 15 passed and 0 failed. Coverage includes a completed sibling that is not double-counted, replacement-ring reuse, a normal close whose first destruction throws, terminal re-close, and backend-loss abandonment without GPU destruction.
- Independent review: a read-only reviewer found no critical, important, or minor issues. It confirmed that completed, failed, and repeatedly released records cannot be counted again; destruction order, first-error preservation, callback suppression, backend-loss behavior, stats identity, and the four-field public shape remain intact.
- Final register review found two documentation-only issues: a stale matrix reference to GAP-028 and an overstatement that aggregate stats alone support selective retry. Both were corrected; the matrix no longer links the closed gap, and the contract now states that hosts must separately track enqueue results and pending callbacks to identify canceled frames. Follow-up review confirmed the 26-row register and found no remaining actionable issues.
- Shader runtime suite: `npm run test:shaders:runtime` exited `0`, including pipeline sink lifecycle, the 15-case focused queue suite, shared backend contracts, renderer API integration, WebGPU context lifecycle, and both concrete frame-export adapters.
- Non-parity JavaScript suite: `node scripts/run-js-tests.js --skip-parity` exited `0`, including shader runtime coverage, language/compiler suites, CPU JavaScript coverage, and documentation source checks.
- Lint: `npm run lint` exited `0` with no diagnostics.
- Register closeout: `llms-full.txt` now records pending accepted reconfigure/close releases as `dropped`, removes GAP-028 from the open-gap table, and changes the open count from 27 to 26.
- Closeout documentation check: `node --test test/docs-static-paths.test.js` exited `0` with 4 passed and 0 failed.
- Complete diff hygiene: `git diff --check HEAD` exited `0`.

## Remaining Work

- Complete review, required local checks, register closeout, commit, rebase, push, and exact-commit CI verification.
