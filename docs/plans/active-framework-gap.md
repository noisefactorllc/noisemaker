# Active Framework Gap: GAP-002

Status: active

## Gap

Exact problem statement from `llms-full.txt`:

> Parser errors are thrown strings/`SyntaxError` without a stable diagnostic schema. `loc` is not documented as a public result

Agent consequence:

> retry code must parse human text and cannot reliably identify spans/codes

## Source Files and Observed Behavior

- `shaders/src/lang/lexer.js` now attaches structured diagnostics to native `SyntaxError` failures; `parser.js` still throws human-readable errors without that contract.
- `shaders/src/lang/diagnostics.js` catalogs lexer, parser, and semantic codes. Lexer failures expose L001-L004; parser failures do not yet expose catalog codes.
- Before the semantic-column fix, `shaders/src/lang/validator.js`: `pushDiag()` read `node.loc.column`, while parser-authored locations use `node.loc.col`. Existing semantic diagnostic locations therefore lost their column when serialized.
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

For the completed semantic-column item and current lexer item:

- `node shaders/tests/test_diagnostic_locations.js` (new public-compile and direct-validator regressions).
- `npm run test:shaders:lang` with the new suite registered.
- `node scripts/run-js-tests.js --skip-parity` with the new suite registered.
- `npm run lint`.
- `node --test test/docs-static-paths.test.js` after updating `llms-full.txt`.
- `git diff --check` and exact pushed commit's triggered GitHub Actions workflows, including Shaders, JavaScript, Docs site, Site, and Downstream when triggered.
- Future lexer/parser work must add focused failures, legacy error compatibility checks, and the same aggregate/CI gates before it is selected.

## Bounded Work Items

Previously completed semantic-column work:

- [x] Add and register regression coverage for exact columns on read/write and multiline inline-read failures, serialized locations, explicit caller-provided columns, missing locations, and unchanged valid plans. Demonstrate the missing-column failure before implementation.
- [x] Map parser `loc.col` into existing diagnostic `location.column`, preserving explicit `loc.column` values and all other fields.
- [x] Review the complete diff, fix actionable findings, and run focused plus required checks.
- [x] Update only the proven semantic-column limitation in `llms-full.txt`; retain GAP-002 and the open-gap count.
- [x] Commit only this run's files, pull/rebase, push normally, and monitor exact-commit CI.

Remaining full-gap work:

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

The semantic-column item is complete and verified locally and in exact-commit CI. The current lexer item and its evidence are below. GAP-002 stays active: structured parser errors, parser coordinate coverage and unavailable-span representation, and full-contract compatibility regressions remain. Continue GAP-002 on the next run; do not select another gap.


## Current Run: Structured Lexer Failures (2026-09-22)

Bounded design: keep throwing native `SyntaxError` with byte-for-byte legacy
messages. Add one non-enumerable `diagnostic` property containing JSON-safe
`code`, `stage`, `severity`, `message`, `location`, and `span`. Preserve ordinary
error enumeration/JSON and all successful token, AST, and compile result shapes.
Use existing L001/L002 codes and add L003 for unterminated comments and L004 for
out-of-range output references. Single-, double-, and triple-quoted strings use L002.

Coordinates: `location.line` and `location.column` are one-based; columns and
zero-based half-open `span.start`/`span.end` offsets count UTF-16 code units.
Only LF starts a new line; CR and tabs each occupy one column. Compute locations
from the source on the failure path so existing scanner bookkeeping quirks do
not corrupt the structured location or require changes to successful tokens.
Unexpected characters cover the rejected code unit; invalid output references
cover the reference; unterminated constructs cover their opening delimiter
through EOF or up to but excluding the unescaped LF ending a single-/double-quoted string scan.
All lexer failures have known spans. Parser diagnostics and unavailable-span
representation remain outside this bounded item.

Files: `shaders/src/lang/lexer.js` (failure construction and five throw sites),
`shaders/src/lang/diagnostics.js` (L003/L004 catalog entries),
`shaders/tests/test_diagnostic_locations.js` (already registered in both
aggregates), `llms-full.txt` (proven public contract), and this active record.

- [x] Add public `lex()`/`compile()` regressions for all lexer failure branches,
  exact legacy error messages/classes, JSON-safe diagnostics, precise spans,
  multiline/CRLF/tab/UTF-16 coordinates, and unchanged successful token shapes.
  Run the suite before implementation and verify missing diagnostics fail.
- [x] Add structured lexer failures using the existing diagnostic catalog without
  changing accepted/rejected source or successful results.
- [x] Review the full diff and run the focused suite, shader-language suite,
  non-parity JS suite, lint, documentation path tests, and diff hygiene.
- [x] Narrow only the proven lexer limitation in the register; leave GAP-002 open.
- [x] Commit this run's files, rebase, push normally, and verify exact-commit CI.

Startup: clean `main` at `52ac841bcda0e80042b6f399bca4b7d66268f48a`, no active
Git operation. Initial pull fast-forwarded to `a0ff705a` with upstream changes
only in `LEDGER.md` and `llms-full.txt`. No callable Shade tools were available;
this item changes language diagnostics only, not shader programs or rendering.


### Current Run Evidence

- After correcting two fixture assumptions (escaped-LF source length and a
  function token requiring a delimiter), the focused pre-implementation run
  exited 1: all nine new failure cases lacked `error.diagnostic`; all six
  compatibility/previous cases passed. Every legacy message assertion passed.
- Focused green run: `node shaders/tests/test_diagnostic_locations.js` exited 0,
  15 passed / 0 failed. New failure cases exercise both `lex()` and `compile()`.
- `npm run test:shaders:lang`, `node scripts/run-js-tests.js --skip-parity`, and
  `npm run lint` each exited 0. The existing suite registration includes all
  15 focused cases in both aggregates; no registration changes were needed.
- `node --test test/docs-static-paths.test.js`: 4 passed / 0 failed, exit 0.
- `git diff --check`: exit 0. GAP-002 and the 23-row open register remain open.
- No builds were run locally. No shader effects, parser behavior, Python code,
  DSL defaults, rendered output, saved programs, or compiled indexes changed.

- Full-diff review found no actionable issues. Independent review also found no
  actionable findings and reran the focused 15-case suite plus diff hygiene.
  Its baseline differential check against `a0ff705a` passed 25,000 inputs:
  4,651 accepted inputs had identical tokens; 20,349 rejected inputs preserved
  error classes/messages and had valid structured coordinates.
- The non-parity suite's `MIDI access failed: Error: adapter unavailable` log is
  an expected operational-error fixture followed by PASS, not an unresolved
  console error.

- Implementation commit `643b2be1e28b62e3282a4009c2ea65c583ed6ccc`
  (`feat: expose structured DSL lexer diagnostics`) was pushed normally after
  `git pull --rebase` reported main up to date; tested sources did not change.
- Exact-commit CI passed: Shaders `35744969052`, Docs site `35744968934`,
  Site `35744968979`, and Downstream `35744968932`. One persistent
  `gh run watch 35744969052 --exit-status` exited 0 after hosted tests, all
  GPU suites, bundle packaging, and both scaffold release dispatches passed.
  JavaScript CI was not triggered by this shader-only source change; its local
  non-parity suite and lint both passed. Dependabot auto-merge was inapplicable
  and skipped.

All selected lexer work is complete, with no remaining work in this bounded
item. GAP-002 stays active for structured parser errors, parser coordinates
and unavailable spans, full-contract regressions, and the remaining full-gap
checks. Select no other gap on the next run.
