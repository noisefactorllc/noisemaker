# Active Framework Gap: GAP-023

Status: active

## Gap

**GAP-023 — `test_compiler_phase2.js` catches assertion failures without setting a nonzero process exit code.**

Exact problem statement from `llms-full.txt`:

> `test_compiler_phase2.js` catches assertion failures without setting a nonzero process exit code.

Agent consequence:

> Automation can report process success while the suite prints `FAIL`. Callers must scan output until the harness is fixed.

## Source Files and Observed Behavior

- `shaders/tests/test_compiler_phase2.js`: the local `test()` helper catches errors and writes `FAIL` to stderr, but does not set `process.exitCode` or rethrow.
- `scripts/run-js-tests.js`: the non-parity runner exits only when a child process returns a nonzero status. It does not currently run the phase-2 compiler harness or a regression test for its failure status.
- Observed before implementation: a deliberately failed copy of the phase-2 harness prints `FAIL` and exits with status `0`.

## Backward-Compatibility Contract

- Preserve every existing DSL parse, validation, plan, step-index, and result shape.
- Preserve the phase-2 harness's existing success output and exit status `0` when all assertions pass.
- Change only the process status for caught test failures: at least one failure must make the process exit nonzero.
- Do not change rendered output, runtime defaults, saved programs, or production bundles.

## Objective Completion Criteria

- A deliberately failed phase-2 compiler assertion produces a nonzero child-process exit status.
- The unchanged phase-2 compiler suite still passes and exits `0`.
- The regression is exercised by the repository's non-parity JavaScript test runner.
- Relevant lint and repository test checks pass.
- The exact pushed commit passes all required GitHub Actions checks triggered for the changed paths.

## Required Tests and CI Checks

- `node shaders/tests/test_compiler_phase2_exit.js`
- `node shaders/tests/test_compiler_phase2.js`
- `npm run test:shaders:lang`
- `node scripts/run-js-tests.js --skip-parity`
- `npm run lint`
- GitHub Actions checks for the exact pushed commit, including the JavaScript and Shaders workflows triggered by changes under `scripts/**` and `shaders/**`.

## Bounded Work Items

- [x] Add a regression test that executes a deliberately failing phase-2 harness and requires a nonzero status.
- [x] Make the phase-2 harness record caught failures in the Node process exit status.
- [x] Register the phase-2 harness and regression test in required repository suites.
- [x] Run focused and required checks, review the complete diff, and fix actionable findings.
- [x] Update `llms-full.txt` only after evidence proves GAP-023 is closed.
- [ ] Commit, rebase, push, and verify required CI for the exact pushed commit.

## Completed Evidence

- Checkout safety: `git status --short --branch` reported `## main...origin/main` with no working-tree changes and no active Git operation.
- Initial synchronization: `git pull --rebase` reported `Already up to date.`
- Red test: `node shaders/tests/test_compiler_phase2_exit.js` exited `1`. It reported that the deliberately failed child harness incorrectly exited `0`.
- Focused regression: `node shaders/tests/test_compiler_phase2_exit.js` exited `0` and printed `PASS: compiler phase-2 failures exit nonzero`.
- Existing harness: `node shaders/tests/test_compiler_phase2.js` exited `0`. All five phase-2 cases passed.
- Shader language suite: `npm run test:shaders:lang` exited `0`. It ran the original harness and the new status regression.
- Non-parity JavaScript suite: `node scripts/run-js-tests.js --skip-parity` exited `0`.
- Lint: `npm run lint` exited `0` with no diagnostics.
- Diff review found one actionable pre-existing hidden failure. The `Chained Variables` assertion expected two plan steps. The compiler has included terminal `_write` as the third step since December 2025. The test now checks all three steps. Production compiler behavior did not change.

## Remaining Work

Commit, rebase, push, and required CI verification remain open. Keep this target active until those checks pass.
