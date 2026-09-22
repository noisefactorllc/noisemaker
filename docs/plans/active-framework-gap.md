# Active Framework Gap: GAP-002

Status: active

## Gap

Exact problem statement from `llms-full.txt`:

> Parser errors are thrown strings/`SyntaxError` without a stable diagnostic schema. `loc` is not documented as a public result

Agent consequence:

> retry code must parse human text and cannot reliably identify spans/codes

## Source Files and Observed Behavior

- `shaders/src/lang/lexer.js` and `parser.js` throw human-readable `SyntaxError` messages without a stable structured diagnostic contract.
- `shaders/src/lang/diagnostics.js` already catalogs lexer, parser, and semantic codes, but lexer/parser failures do not expose those codes uniformly.
- Before this run, `shaders/src/lang/validator.js`: `pushDiag()` read `node.loc.column`, while parser-authored locations use `node.loc.col`. Existing semantic diagnostic locations therefore lost their column when serialized.
- Pre-fix reproduction through public `compile()`: `search synth\n  read(123).write(o0)` produces located S001 and S005 diagnostics with line 2 and undefined columns instead of columns 3 and 13.
- Many AST nodes have no `loc` at all. This run does not invent coordinates for those nodes or claim complete source-span coverage.

## Backward-Compatibility Contract

- Preserve accepted/rejected DSL behavior, rendered output, defaults, saved programs, effect step indexes, compiled plans, and public result fields.
- Populate the existing `Diagnostic.location.column` from parser-authored `loc.col`; preserve an explicit existing `loc.column` on caller-supplied ASTs.
- Preserve diagnostics without a location, code/message/severity/identifier fields, and the parser AST shape. Do not introduce a second public location field.
- Preserve existing thrown error classes and messages. Future structured lexer/parser diagnostics must be additive on existing errors or opt-in/versioned if their result contract changes.
- No effect definitions, shader programs, backend behavior, or Python code changes.

## Objective Completion Criteria

- [ ] Lexer and parser failures expose a stable machine-readable diagnostic contract without parsing message text, while preserving legacy calls.
- [ ] Diagnostic source coordinates have a defined public convention and reliable coverage for lexer/parser failures, with explicitly represented unavailable spans.
- [x] Existing located semantic diagnostics preserve their line and obtain the parser-provided column; caller-supplied columns and unlocated diagnostics remain compatible.
- [ ] Regressions prove the new contracts and legacy compatibility through public entry points.
- [ ] All required local checks and exact-commit CI pass for each bounded implementation.

## Required Tests and CI Checks

For this run's semantic-column item:

- `node shaders/tests/test_diagnostic_locations.js` (new public-compile and direct-validator regressions).
- `npm run test:shaders:lang` with the new suite registered.
- `node scripts/run-js-tests.js --skip-parity` with the new suite registered.
- `npm run lint`.
- `node --test test/docs-static-paths.test.js` after updating `llms-full.txt`.
- `git diff --check` and exact pushed commit's triggered GitHub Actions workflows, including Shaders, JavaScript, Docs site, Site, and Downstream when triggered.
- Future lexer/parser work must add focused failures, legacy error compatibility checks, and the same aggregate/CI gates before it is selected.

## Bounded Work Items

Selected for this run; finish all before returning:

- [x] Add and register regression coverage for exact columns on read/write and multiline inline-read failures, serialized locations, explicit caller-provided columns, missing locations, and unchanged valid plans. Demonstrate the missing-column failure before implementation.
- [x] Map parser `loc.col` into existing diagnostic `location.column`, preserving explicit `loc.column` values and all other fields.
- [x] Review the complete diff, fix actionable findings, and run focused plus required checks.
- [x] Update only the proven semantic-column limitation in `llms-full.txt`; retain GAP-002 and the open-gap count.
- [x] Commit only this run's files, pull/rebase, push normally, and monitor exact-commit CI.

Later runs, not selected now:

- [ ] Define and implement the compatible structured lexer/parser error contract and source-coordinate coverage with red-green tests.
- [ ] Verify the full GAP-002 contract, update the gap register from evidence, and mark this record closed only after all completion criteria pass.

## Completed Evidence

- Started on clean `main` at `3001db9130769634ec29b55b0c95fb3772a13776`, tracking `origin/main`, with no active Git operation.
- Initial `git pull --rebase`: already up to date.
- Previous active target GAP-022 was closed. Selected GAP-002 for a bounded developer-contract correction.
- Shade tool discovery returned no callable Shade tools. This item changes language diagnostics only, with no shader development or rendered-output changes.
- Root cause confirmed by public `compile()` reproduction and the parser/validator location field mismatch.

- Focused red run: after correcting the test fixture's AST path, `node shaders/tests/test_diagnostic_locations.js` exited 1 with exactly two missing-column failures (expected columns 3/13 and 17, received undefined); all three compatibility cases passed before implementation.
- Minimal implementation: `pushDiag()` now uses `node.loc.column ?? node.loc.col` for the existing `location.column` field. No new public fields or validation policy were introduced.
- Focused green run: `node shaders/tests/test_diagnostic_locations.js` exited 0 with 5 passed and 0 failed.
- Aggregate coverage: registered the focused suite once in `test:shaders:lang` and once in the non-parity JavaScript runner.
- `npm run test:shaders:lang` exited 0 and ran all five new cases.
- `node scripts/run-js-tests.js --skip-parity` exited 0 and ran all five new cases. Its MIDI adapter-unavailable message is an expected operational-error test fixture, followed by PASS.
- `npm run lint` exited 0 with no diagnostics.
- `node --test test/docs-static-paths.test.js` exited 0 with 4 passed and 0 failed.
- `git diff --check` exited 0. The register retains GAP-002 and its existing open-gap count.

- Independent high-reasoning review of all six changed files found no Critical, Important, or Minor issues. The reviewer reran the five focused tests and diff hygiene, checked caller column zero, and compared baseline/current behavior: only the intended parser-provided columns changed. Aggregate registration propagates failures correctly.

- Implementation commit: `e5bd2013087e54d53841db8c45a54f973aaa5174` (`fix: preserve source columns in DSL diagnostics`).
- Pre-push `git pull --rebase` reported main up to date and did not change tested sources.
- Normal push advanced `origin/main` from `3001db91` to `e5bd2013`.
- Exact-commit CI passed: Shaders `35698026719`, JavaScript `35698026738`, Docs site `35698026995`, Site `35698026613`, and Downstream `35698026692` all completed successfully for the implementation SHA.
- Shaders included hosted language/runtime/render/structure checks, all GPU suites, bundle packaging, and both scaffold release dispatches. One persistent `gh run watch` monitored this workflow to successful completion.
- Follow-on Release `35698413358` also passed for the implementation SHA, including Linux/macOS/Windows standalone builds, JS/shader bundles, and release publication. It was monitored with a separate sequential persistent watch after Shaders completed. Dependabot auto-merge runs were skipped as inapplicable.

## Remaining Work

This run's semantic-column item is complete and verified locally and in exact-commit CI. GAP-002 stays active: structured lexer/parser errors, a defined source-coordinate contract with coverage, and regressions for that full contract remain. Continue GAP-002 on the next run; do not select another gap.
