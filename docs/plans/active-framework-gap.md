# Active Framework Gap: GAP-001

Status: closed

## Gap

**GAP-001 — No enforced `o0`-`o7` range.**

Exact problem statement from `llms-full.txt`:

> No enforced `o0`-`o7` range.

Agent consequence:

> `o8` parses and fails later/indirectly instead of producing a range diagnostic.

## Source Files and Observed Behavior

- `shaders/src/lang/lexer.js`: the output-reference scanner accepts one or more digits after `o`, so `o8` and `o99` become ordinary `OUTPUT_REF` tokens.
- `shaders/src/lang/parser.js`: `render()`, `read()`, `write()`, expressions, and effect arguments accept those tokens without a range check.
- `shaders/src/runtime/pipeline.js`: the public display-surface set is `o0` through `o7`, but graph scanning can allocate other `global_*` names, allowing invalid output references to escape the declared DSL boundary.
- `package.json` and `scripts/run-js-tests.js`: the required language and non-parity routes have no focused regression for the output-surface range.

## Backward-Compatibility Contract

- Preserve valid DSL behavior for `o0` through `o7`, rendered output, defaults, saved valid programs, step indexes, and public compile result shapes.
- Reject only output references outside the already documented and runtime-supported public `o0`-`o7` contract.
- Preserve source-reference and non-output surface token behavior.
- Use the existing located `SyntaxError` convention; do not add an alias, alternate syntax, compatibility fallback, or new public result wrapper.
- Do not change effect definitions, shader programs, backend allocation, or the Python implementation.

## Objective Completion Criteria

- The public DSL compiler rejects every digit-suffixed output reference outside `o0` through `o7` before parsing or graph expansion.
- The failure is a `SyntaxError` that identifies the invalid reference, the accepted range, and its source line and column.
- Valid boundary references `o0` and `o7` retain their existing tokens and compiler behavior.
- A focused regression fails against the pre-change lexer and passes after the implementation.
- The regression runs in both the shader language suite and the non-parity JavaScript suite.
- Shader language tests, non-parity JavaScript tests, lint, documentation-path checks, and the exact pushed commit's required GitHub Actions checks pass.

## Required Tests and CI Checks

- `node --test shaders/tests/test_output_surface_range.js`
- `npm run test:shaders:lang`
- `node scripts/run-js-tests.js --skip-parity`
- `npm run lint`
- `node --test test/docs-static-paths.test.js` after changing `llms-full.txt`.
- GitHub Actions checks for the exact pushed commit, including every workflow triggered by the changed paths.

## Bounded Work Items

- [x] Add and register a public-compile regression covering invalid output references in render, read, and write positions plus valid `o0`/`o7` boundaries; verify the pre-change failure.
- [x] Add the minimal lexer range check with a located `SyntaxError`; verify the focused regression passes.
- [x] Review the complete diff and run the focused and required repository checks.
- [x] Update `llms-full.txt` only after evidence proves GAP-001 is closed.
- [x] Commit only this run's files, rebase, push normally, and verify required CI for the exact pushed commit.

## Completed Evidence

- Checkout safety: `git status --short --branch` reported clean `main` tracking `origin/main`, with no active merge, rebase, or cherry-pick operation.
- Initial synchronization: `git pull --rebase` fast-forwarded `main` from `782f0726` to `5a1225f8` without conflicts. The upstream changes were limited to Python dependency metadata and an audio test.
- Target selection: the previous GAP-013 record was closed before this scheduled run. GAP-001 is repository-owned, correctness-focused, and bounded to the existing DSL output-surface contract.
- Shade MCP availability check: no Shade MCP tool is exposed in this run. This target changes lexer validation and does not modify effect definitions, shader programs, or rendered output.
- Focused red run: `node --test shaders/tests/test_output_surface_range.js` exited `1`; the valid boundary case passed, while render `o8`, read `o99`, and write `o10` all failed because the compiler did not throw.
- Initial implementation: `shaders/src/lang/lexer.js` rejects output references that do not match `o0` through `o7` with the reference, accepted range, line, and column in a `SyntaxError`.
- Independent review found one Important compatibility issue: the first implementation also rejected output-shaped dotted member segments such as `foo.o8`, which the parser intentionally accepts. A second red run reproduced that regression.
- Review fix: range enforcement now excludes a token whose immediately preceding token is `DOT`. Regression coverage preserves `foo.o0`, `foo.o7`, `foo.o8`, `foo.o99`, and the existing `s99`, `vol99`, `geo99`, `xyz99`, `vel99`, `rgba99`, and `mesh99` token families.
- Focused green run: `node --test shaders/tests/test_output_surface_range.js` exited `0` with 6 passed and 0 failed.
- Independent re-review reported no Critical, Important, or Minor issues and judged the change ready for broader suites and closeout.
- Shader language suite: `npm run test:shaders:lang` exited `0`, including the new output-surface regression and all existing language/compiler checks.
- Non-parity JavaScript suite: `node scripts/run-js-tests.js --skip-parity` exited `0`, including the registered regression, shader runtime/language coverage, CPU JavaScript coverage, and documentation source checks.
- Lint: `npm run lint` exited `0` with no diagnostics.
- Register closeout: `llms-full.txt` records located pre-parse range enforcement, preserves dotted-member and non-output reference behavior, removes GAP-001 from the open table and matrix, and changes the open count from 25 to 24.
- Closeout documentation check: `node --test test/docs-static-paths.test.js` exited `0` with 4 passed and 0 failed.
- Register structure and diff hygiene: the open-gap table contains exactly 24 rows and `git diff --check` exited `0`.
- Implementation commit: `50b8f909ff59f177eb1312de7be461b16bbdd657` (`fix: enforce DSL output surface range`).
- Pre-push synchronization: `git pull --rebase` rebased the implementation onto upstream `353de205`. Upstream changed `LEDGER.md`, `docs/shaders/renderer-output.rst`, and `llms-full.txt`; it did not change the lexer or test sources.
- Post-rebase documentation verification: `node --test test/docs-static-paths.test.js` exited `0` with 4 passed and 0 failed; the open-gap table still contained exactly 24 rows and diff hygiene passed.
- Push: the normal `git push origin main` advanced `main` from `353de205` to `50b8f909`.
- Exact-commit CI: Shaders run `35629197573`, JavaScript run `35629197578`, Docs site run `35629197549`, Downstream run `35629197535`, and Site run `35629198011` all completed successfully for `50b8f909ff59f177eb1312de7be461b16bbdd657`. Shaders included the language and render suites, GPU checks, shader bundle packaging, and both scaffold release-dispatch jobs.

## Remaining Work

None. All GAP-001 completion criteria passed. Select the next gap only in a later scheduled run.
