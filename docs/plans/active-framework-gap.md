# Active Framework Gap: GAP-002

Status: active

## Gap

Exact problem statement from `llms-full.txt`:

> Parser errors outside shared token expectations, automation argument validation, search directive validation, reachable output validation, and explicit subchain validation lack a stable diagnostic schema; parser locations retain token-counter limitations and source spans are unavailable. Complete AST `loc` coverage is not a public contract

Agent consequence:

> retry code must still parse human text for remaining parser failures and cannot reliably identify parser source spans

## Source Files and Observed Behavior

- `shaders/src/lang/lexer.js` now attaches structured diagnostics to native `SyntaxError` failures; `parser.js` exposes structured P001/P002 diagnostics for shared token expectations and P003 for automation argument validation and P004 for search directive validation and P005 for reachable output validation and P006 for explicit subchain validation; other throw paths remain unstructured.
- `shaders/src/lang/diagnostics.js` catalogs lexer, parser, and semantic codes. Lexer failures expose L001-L004; shared parser token expectations expose P001/P002 and automation argument validation exposes P003 and search directive validation exposes P004 and reachable output validation exposes P005 and explicit subchain validation exposes P006; other parser failures do not yet expose catalog codes.
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


## Current Run: Parser Token Expectations (2026-09-22 evening)

Continue GAP-002. Startup: clean main at ae4e3302, synchronized with origin/main,
no active Git operation or pending job-owned publication; initial pull/rebase
reported already up to date. Select only the shared parser expect() failure
path for this run. Other parser throw sites and source-derived parser spans
remain later bounded work.

Design: preserve native SyntaxError class and exact message; add the existing
non-enumerable diagnostic property shape with P002 for expected RPAREN and
P001 for other token mismatches, catalog stage/severity, and message. Location
copies the unexpected token's positive integer line/col as line/column; if
either is unavailable, location is null. Span is explicitly null because the
public token contract does not carry source offsets. Token coordinates retain
legacy scanner limitations; this does not claim source-derived parser coverage.
Successful token/AST/compile shapes, accepted DSL, defaults, saved programs,
rendered output, and step indexes remain unchanged.

Files: shaders/src/lang/parser.js, shaders/tests/test_diagnostic_locations.js,
llms-full.txt, and this active record. No shader programs/effects or Python edits.

- [x] Prove shared-expect failures lack diagnostics through parse(lex(source))
  and compile(source), with legacy messages, EOF, multiline/UTF-16, serialization,
  and unavailable caller-token location coverage.
- [x] Add the bounded compatible parser diagnostics.
- [x] Review and run focused diagnostics, shader-language aggregate, non-parity
  JS aggregate, lint, documentation path checks, and diff hygiene.
- [x] Update only the proven register limitation; retain GAP-002 as active.
- [x] Commit, rebase, normally push, verify exact-source CI and publication.

Existing publication consequences: Shaders runs hosted and GPU suites before
bundles and Scaffold static-site/library release dispatches; generated release
tags trigger Release artifact builds. No manual dispatch or local build is needed.

### Parser Expectation Evidence

- Focused red run: 15 existing cases passed, all 11 added cases failed because
  error.diagnostic was undefined; legacy class/message assertions passed.
- Focused green run: 26 passed, 0 failed, exit 0.
- Baseline differential check against ae4e3302: 3,265 lexable mutations;
  685 accepted ASTs identical, 2,580 rejected inputs kept error class/message;
  1,809 errors gained the intended structured expectation diagnostic.
- Shader-language aggregate, ESLint, and four-case docs static-path suite
  passed with exit 0. Non-parity JS aggregate also passed, exit 0.
  Its MIDI adapter-unavailable log is an expected fixture followed by PASS.
- No local builds or shader changes. No callable Shade tools were available.
- Independent read-only review found no actionable issues; it reran the
  26-case suite and compared 16 rejected inputs and three accepted ASTs with
  ae4e3302, preserving all legacy behavior. Full-diff review and diff hygiene
  passed. Only the four planned files are changed; the 23-row open register
  remains open.
- Remaining full-gap criteria: other parser throw sites, source-derived parser
  coordinates/spans, and full-contract verification. This bounded item does
  not claim full parser diagnostic coverage.

- Implementation commit `44bc4ed4ac729bddaa95b083d64bee942ade35da`
  (`feat: expose structured parser expectation diagnostics`) pushed normally
  after an unchanged pre-push rebase.
- Exact-commit workflows passed: Shaders `35795782020`, Docs site
  `35795781884`, Site `35795781762`, and Downstream `35795782012`.
  JavaScript CI was not triggered by these paths; required local JS/lint passed.
  Inapplicable Dependabot auto-merge was skipped.
- One persistent Shaders watch exited 0 after all hosted and GPU suites,
  bundle upload, and both Scaffold dispatches passed. The uploaded shader
  artifact is nonempty, unexpired, and tied to the implementation SHA.
- Scaffold library release `35796072192` passed for the implementation SHA,
  including CDN purge. Follow-on Release `35796113305` passed under one
  sequential persistent watch, publishing `v1.0.169` with nonempty Linux,
  macOS, Windows, shader, and JavaScript assets. The remote annotated tag
  peels to exactly `44bc4ed4ac729bddaa95b083d64bee942ade35da`.

All selected parser-expectation work is complete. GAP-002 remains active for
other parser failure paths, source-derived parser coordinate/span coverage,
and full-contract verification. Continue this same gap next run.

## Current Run: Automation Argument Failures (2026-09-23)

Continue GAP-002 on the existing main checkout. Startup was clean at
`dd38fdd2baf820b112520bd024e4db8c55f09789`, with no active Git operation or
pending job-owned publication. Initial pull/rebase fast-forwarded to
`532ed64775000635e43caac085e4451c06e71afc`; upstream changes were documentation.

Bounded design: use the existing non-enumerable `error.diagnostic` contract for
all explicit argument-validation failures in `transformOscInvocation`,
`transformMidiInvocation`, and `transformAudioInvocation`. Add catalog code
P003 (invalid automation arguments). Reuse the shared parser error construction
for P001/P002 and P003; keep native SyntaxError class, exact messages, ordinary
error enumeration/JSON, accepted DSL, successful AST/compile fields and indexes,
and all defaults unchanged. P003 locations identify the invocation's name token;
invalid/missing token coordinates produce null. Spans stay explicitly null.
Token-counter limitations and other parser failure paths remain open.

Files: `shaders/src/lang/parser.js`, `shaders/src/lang/diagnostics.js`,
`shaders/tests/test_diagnostic_locations.js`, `llms-full.txt`, and this record.
No shader effects/programs, Python, or runtime changes. Shade tool discovery
found no callable tools; this bounded item is language diagnostics only.

- [x] Add public parse/compile regressions for every selected failure branch,
  both selector fields, error serialization, CRLF/tab/UTF-16 locations, missing
  caller-token coordinates, and preserved valid automation defaults/results.
  Demonstrate absent diagnostics before implementing.
- [x] Extract the existing parser diagnostic constructor, add P003, and convert
  only the selected automation failure sites without changing validation.
- [x] Review the complete diff; run focused diagnostics, shader-language and
  non-parity JS aggregates, lint, docs static-path checks, and diff hygiene.
- [x] Narrow only the proven register limitation; retain the 23 open gap rows.
- [x] Commit scoped work, pull/rebase, normally push, verify exact-source CI
  and the existing downstream publication; publish final evidence.

Publication path reviewed: Shaders runs hosted and real GPU tests, bundles,
and Scaffold static-site/library dispatches. Library publication creates the
release tag that triggers Release artifact builds. Docs site, Site, and
Downstream run for applicable paths. Preserve these existing workflows; no
local builds, manual dispatches, branches, worktrees, or PRs.


### Automation Argument Evidence

- Initial regression run exposed missing diagnostics and one incorrect column
  fixture. Checked the baseline parser and corrected column 26 to column 24.
  Replayed the corrected suite against baseline parser `532ed647`: exit 1,
  27 passed / 24 failed, all failures from missing structured diagnostics.
- Current focused suite: exit 0, 51 passed / 0 failed. It exercises all 18
  selected throw sites, both name/id branches, public parse and compile,
  serialization, invalid caller-token coordinates, and valid AST defaults.
- Baseline differential check: 2,536 inputs; 1,020 accepted ASTs and compiled
  results unchanged; 1,516 errors preserve class, message, enumeration, and
  JSON. Of those errors, 1,132 gained P003; other parser errors stayed unchanged.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and
  four-case documentation static-path suite all exited 0. The existing MIDI
  adapter-unavailable fixture logged its expected error and passed.
- Complete diff review and independent read-only review found no actionable
  findings. The reviewer independently passed all 51 focused cases and diff
  hygiene. Exactly the five planned files changed; 23 open-gap rows remain.
- No local builds or shader/rendering changes. GAP-002 remains active for
  other parser throw sites, source-derived parser coordinates/spans, and
  full-contract verification.

- Implementation `e32a5a4a2e1f7b20e4b0db010ad41fd3a30b396b`
  (`feat: expose structured automation argument diagnostics`) pushed normally
  after an unchanged pre-push rebase; remote main confirmed at that SHA.
- Exact-commit CI passed: Shaders `35830018106`, Docs site `35830018127`,
  Site `35830018161`, and Downstream `35830018186`. JavaScript workflow was
  not triggered by these paths; required local JS/lint checks passed.
  Inapplicable Dependabot auto-merge was skipped.
- The persistent Shaders CLI watch exited 0 after hosted/GPU suites, bundle
  upload, and both Scaffold dispatches passed. The shader artifact is nonempty
  (1,441,094 bytes), unexpired, and records the exact implementation SHA.
- Scaffold library release `35830522179` passed for the implementation SHA,
  including CDN purge. Static-site releases `35830028038` and `35830520406`
  passed for noisemaker-site at the same SHA.
- Follow-on Release `35830555378` passed under one sequential persistent
  CLI watch, publishing `v1.0.170`. Its annotated remote tag peels to the exact
  implementation SHA; all eight Linux/macOS/Windows/shader/JS assets are
  nonempty and the release is published, not a draft.

All selected automation-argument work is complete. GAP-002 remains active for
other parser failure paths, source-derived parser coordinate/span coverage,
and full-contract verification. Continue this same gap next run.

## Current Run: Search Directive Failures (2026-09-23)

Continue GAP-002. Startup was clean main at `731b76e4`; initial pull/rebase
advanced to `893a9a558ad9fc1c8ae7b9849aa3b530cbc10d94` with documentation-only
changes. No active Git operation or pending prior job publication was found.

Bounded design: attach the existing non-enumerable diagnostic contract with
P004 (invalid search directive) to the seven explicit search validation sites:
duplicate directive, invalid namespace, missing first/additional namespace,
misplaced top-level/nested directive, and missing required directive. Keep
native SyntaxError classes/messages, error JSON/enumeration, validation order,
accepted source, AST/compile shapes, defaults, and indexes unchanged. Use the
existing offending token coordinates; missing required search points to the
consumed EOF token. Invalid/missing coordinates and all spans remain null.
Source-derived parser coordinates, other throw paths, and full-gap closure
remain out of scope for this item.

Files: `shaders/src/lang/parser.js`, `shaders/src/lang/diagnostics.js`,
`shaders/tests/test_diagnostic_locations.js`, `llms-full.txt`, and this record.
No shader development; Shade discovery returned no callable tools.

Publication path: Shaders runs hosted/GPU suites, bundle packaging, and
existing Scaffold library/static-site dispatches; the library release creates
a tag triggering Release artifacts. Applicable Docs site, Site, and Downstream
checks also apply. No local builds or manual release/dispatch operations.

- [x] Prove missing diagnostics with public parse/compile regressions covering
  every selected branch, EOF, CRLF/tab/UTF-16, missing caller coordinates, and
  preserved successful namespace behavior.
- [x] Apply P004 only to the selected explicit search validation failures.
- [x] Review the complete diff and run focused, language, non-parity JS, lint,
  documentation-path, compatibility differential, and diff-hygiene checks.
- [x] Narrow the proven register limitation; retain GAP-002 and 23 open gaps.
- [x] Commit scoped changes, rebase, push normally, verify exact-source CI and
  downstream artifacts, and publish final evidence.


### Search Directive Evidence

- Baseline reproduction confirmed all seven selected explicit throw sites lack
  diagnostics. Corrected one test fixture from `ast.searchOrder` to the existing
  `ast.namespace.searchOrder` before the final red run. Corrected red run exited
  1: 52 passed / 11 failed, all failures from missing diagnostics.
- Focused green suite exited 0: 63 passed / 0 failed, exercising public parse
  and compile entry points, every selected failure branch, EOF, CRLF/tab/UTF-16
  coordinates, unavailable caller-token coordinates, error JSON/enumeration,
  and valid namespace order, keyword namespaces, duplicate namespaces, and
  compiled indexes.
- Differential test against `893a9a55`: 4,050 inputs, 741 accepted ASTs unchanged,
  3,309 rejected inputs preserving error class/message/JSON/enumeration;
  2,505 failures gained P004. Other diagnostics remained unchanged.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and
  four-case docs static-path suite all exited 0. The JavaScript suite's existing
  MIDI adapter-unavailable fixture logged its expected error and passed.
- Complete diff review and independent read-only review found no actionable
  findings. Independent reviewer reran all 63 focused cases and diff hygiene.
- Exactly the five planned files changed. `git diff --check` passed; the register
  retains 23 open gaps and GAP-002 stays active. No local builds or shader,
  renderer, runtime, or Python changes.
- Implementation `0766743e6fb8e7d640f7958aa1b2930544e4da22`
  (`feat: expose structured search directive diagnostics`) pushed normally
  after an unchanged pre-push rebase. Remote main confirmed at that SHA.
- Exact-source CI passed: Shaders `35878981076`, Docs site `35878981097`,
  Site `35878980896`, and Downstream `35878980941`. Shaders included hosted
  and real GPU suites, bundles, and both existing release dispatches.
  JavaScript workflow did not trigger for these paths; local JS/lint passed.
  Inapplicable Dependabot auto-merge was skipped.
- The persistent Shaders CLI watch exited 0. Its unexpired shader artifact
  records the exact implementation SHA and is nonempty (1,440,036 bytes).
- Scaffold library release `35879409666` passed for this exact SHA, including
  CDN purge. Static-site releases `35878996863` and `35879409076` passed for
  noisemaker-site; `35879019886` passed for noisemaker-docs at the same SHA.
  The site workflow's optional CDN verification/purge jobs were skipped by
  its existing conditions; no separate live CDN assertion is made here.
- Release `35879492002` passed for the implementation SHA and published
  `v1.0.171`. The remote annotated tag was independently resolved through
  GitHub's API to the exact SHA; all eight Linux/macOS/Windows/shader/JS assets
  are nonempty, and the release is neither draft nor prerelease. One
  sequential persistent CLI watch was used for each of Shaders, library
  release, and Release; all exited 0 (Release was already successful when
  watched).
- SSH remote checks later failed twice with public-key authentication errors.
  Existing GitHub CLI HTTPS credentials verified remote main and completed
  an unchanged pull/rebase using command-scoped transport configuration.
  No repository or authentication configuration was changed.

All selected search-directive work is complete. GAP-002 remains active for
other parser throw paths, source-derived parser coordinates/spans, and
full-contract verification. Continue this target on the next run.


## Current Run: Output Validation Failures (2026-09-23 evening)

Continue GAP-002. Startup: clean main at cc1ba2687f9a10d8aa8488323d155a5e0fccc338,
no active Git operation or pending job-owned publication. Initial pull/rebase
reported already up to date. The remote default branch is main and the existing
HTTPS publication path is accessible.

Bounded design: attach P005 (invalid output operation) using the existing
parserError helper at five reachable explicit validation sites: render target,
write/write3d in expression context, write surface, write3d texture, and
write3d geometry. Preserve native SyntaxError and exact messages, accepted and
rejected DSL, validation order, successful AST/compile shapes, defaults, saved
programs, rendered output, and step indexes. Location identifies the rejected
token (write keyword for expression-context rejection), or is null for missing
caller coordinates; span remains null. Token-counter limitations remain.
The unreachable duplicate-render and write-dispatch fallback throw sites are
not selected; no control-flow change is authorized by this item.

Files: shaders/src/lang/parser.js, shaders/src/lang/diagnostics.js,
shaders/tests/test_diagnostic_locations.js, llms-full.txt, and this record.
No shader programs, effects, backends, or Python changes. No callable Shade
tools were discovered; this item changes language errors only.

Publication consequences: existing Shaders hosted/GPU tests gate bundles and
Scaffold library/static-site dispatches; library tags trigger Release artifacts.
Docs site, Site, and Downstream also trigger for the selected paths. No manual
dispatch, local build, or publication-system change.

- [x] Add parse/compile regressions for all five sites, EOF, multiline/CRLF/tab/
  UTF-16 input, unavailable caller coordinates, unchanged shared-expect errors,
  and valid render/write/write3d shapes. Verify missing diagnostics fail first.
- [x] Add P005 to the catalog and replace only the five selected error constructors.
- [x] Review the complete diff; run focused diagnostics, language aggregate,
  non-parity JS aggregate, lint, docs static paths, differential compatibility,
  and diff hygiene. Fix every actionable finding.
- [x] Narrow the proven gap statement; keep GAP-002 active and the open count.
- [x] Commit scoped changes, rebase, push normally, verify exact-source CI and
  existing downstream artifacts, and publish final evidence.

Review focus: malformed caller-token coordinates, EOF targets, UTF-16 columns,
shared expectation precedence, and accepted output forms/defaults/indexes.
Full source-derived parser coordinates and remaining throw paths stay open.


### Output Validation Evidence

- Corrected the success fixture to assert the existing render result string
  (`o1`) before final red verification. Corrected red run exited 1: 65 passed /
  14 failed, all failures because error.diagnostic was missing. Legacy message
  and class checks passed, as did accepted-form and precedence compatibility.
- Focused green run: 79 passed / 0 failed, exit 0. Both parse and compile cover
  all five selected sites; EOF, CRLF/tab/UTF-16, unavailable caller coordinates,
  native error/JSON compatibility, accepted surface/reference forms, render
  selection, shared expectation precedence, and compiled indexes are covered.

- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and
  four-case docs static-path suite all exited 0. The existing MIDI adapter-
  unavailable fixture logged its expected error and passed.
- Differential verification against cc1ba268: 4,555 generated inputs, 5 lexer
  rejections excluded, 354 accepted ASTs/compile outcomes unchanged, 4,196 parser
  rejections preserving legacy class/message/JSON/enumeration, and 2,167 errors
  gaining P005. Other structured diagnostics stayed unchanged.
- Complete diff review and independent read-only review found no actionable
  issues. The independent reviewer reran 79 focused cases and diff hygiene;
  an additional 65 caller-coordinate/property-descriptor checks passed.
- Only the five planned files changed. Diff hygiene passed; 23 open gap rows
  remain. GAP-002 is active for remaining parser throw paths, source-derived
  coordinates/spans, and full-contract verification. No local builds ran.

### Output Validation Publication Reconciliation (2026-09-24)

- The previous run stopped before pushing because concurrent unrelated edits
  made the checkout unsafe. Its corrected scoped commit was
  `7a54ab3856d71ce037f11215572e8137ad4f53c0`; no unrelated work was published by
  that run. This run verified all five retained commit blobs against its
  checkpoint and reviewed the complete diff again with no actionable findings.
- Startup was clean main at `285e50f538371ffa1ed5656821a417fef36e7c5c`, with no
  active Git operation or local-only commits. Initial pull/rebase was unchanged.
  Remote main already contained the implementation through published tip
  `c9ee8a049b2b63cd300da67c01ee40baf29dc288`. The only changes between the
  implementation and that tip were `LEDGER.md` and `llms-full.txt`; shader
  sources, tests, dependency manifests, scripts, and workflows were identical.
- There are no CI runs for ancestor `7a54ab38` itself. Exact published-tip CI at
  `c9ee8a04` passed: [Shaders 35958155355](https://github.com/noisefactorllc/noisemaker/actions/runs/35958155355),
  [Docs site 35958155293](https://github.com/noisefactorllc/noisemaker/actions/runs/35958155293),
  [Site 35958155325](https://github.com/noisefactorllc/noisemaker/actions/runs/35958155325),
  and [Downstream 35958155287](https://github.com/noisefactorllc/noisemaker/actions/runs/35958155287).
  Shaders passed hosted tests, GPU tests, bundles, and both release dispatches.
  Its exact-SHA artifact was nonempty (1,441,592 bytes) and unexpired.
- [Scaffold library release 35958426549](https://github.com/noisefactorllc/scaffold/actions/runs/35958426549)
  passed for `c9ee8a04`, including successful purge of all seven CDN edges.
  Scaffold static-site runs `35958166180` and `35958425307` passed for
  noisemaker-site; `35958182265` passed for noisemaker-docs at that same SHA.
  No separate current live-site or live-CDN assertion is made.
- [Release 35958467661](https://github.com/noisefactorllc/noisemaker/actions/runs/35958467661)
  passed. The `v1.0.176` annotated tag resolves to exactly `c9ee8a04`; all eight
  expected desktop, shader, and JavaScript assets are nonempty. The release is
  neither draft nor prerelease. One sequential `gh run watch --exit-status`
  process for each of Shaders, library release, and Release exited 0; all had
  already completed successfully. No manual dispatch or release was performed.
- Fresh local verification on unchanged engine sources: focused diagnostics
  79/79, shader-language aggregate, non-parity JavaScript aggregate, ESLint,
  and documentation paths 4/4 all passed. The expected MIDI adapter-unavailable
  fixture passed. JavaScript CI was not triggered by the published paths;
  inapplicable Dependabot auto-merge was skipped. No local builds ran.

The prior output-validation implementation and publication are verified. This
run completes its evidence record only. GAP-002 remains active for other parser
throw paths, source-derived coordinates/spans, and full-contract verification.


## Current Run: Structured Subchain Failures (2026-09-24)

Bounded design: add P006 (invalid subchain) through the existing parserError
helper at the three explicit parseSubchainCall validation sites. Invalid string
values and missing body dots use the rejected token, including EOF. Empty bodies
use the invocation token. Preserve native SyntaxError messages, JSON/enumeration,
accepted AST/compile shapes, defaults, indexes, and shared-expectation precedence.
Locations retain the existing positive-integer token coordinate contract; unknown
locations and source spans remain null. This does not tighten subchain argument
keys, separators, or duplicates and does not close GAP-027.

Files: shaders/src/lang/parser.js, shaders/src/lang/diagnostics.js,
shaders/tests/test_diagnostic_locations.js, llms-full.txt, and this record.

- [x] Add regressions through parse and compile for all three sites, EOF,
  comments, CRLF/tab/UTF-16, unavailable caller coordinates, legacy error shape,
  shared-expectation precedence, and accepted subchain arguments/body/indexes.
  Verify the new diagnostic assertions fail before implementation.
- [x] Add P006 and replace only the three selected SyntaxError constructors.
- [x] Review the entire diff; run focused diagnostics, language aggregate,
  non-parity JavaScript, ESLint, documentation paths, compatibility differential,
  and diff hygiene; correct actionable findings.
- [x] Narrow the proven GAP-002 statement without closing it or GAP-027.
- [x] Commit scoped work, rebase, push normally, verify exact-source CI and
  existing downstream artifacts, and publish final evidence.

Review focus: EOF targets; invocation location for empty/comment-only bodies;
malformed caller coordinates; shared expectation precedence; preserved unknown
keys, optional commas, duplicate overwrite behavior, defaults and step indexes.

Startup: clean main at 9928905a; no active Git operation or local-only commits;
initial pull/rebase unchanged. Prior publication is complete. Existing workflows
trigger Shaders, Docs site, Site and Downstream for these paths, with shader
bundle, scaffold library/site dispatches, and the resulting tagged Release.
The configured GitHub actor has push access and existing dispatch secrets are
present. No callable Shade tools were discovered; this is language diagnostic
work, with no shader programs, effects, or renderer changes.


### Subchain Validation Evidence

- Corrected the accepted fixture to use a registered filter instead of a
  starter-only effect before final red verification. Corrected red run exited
  1 with 81 passed / 10 failed; every failure was a missing diagnostic.
- Focused green run: 91 passed / 0 failed, exit 0. Both parse and compile cover
  all three explicit sites, EOF, comment-only bodies, CRLF/tab/UTF-16 text,
  unavailable caller coordinates, native error properties/JSON, shared error
  precedence, accepted permissive arguments, defaults, and compiled indexes.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and
  documentation paths (4/4) exited 0. No local builds ran.
- Differential verification against 9928905a: 6,741 generated inputs; 165 lexer
  rejections excluded, 126 accepted ASTs unchanged, 6,450 parser rejections
  preserving legacy class/message/JSON/enumeration, and 3,459 errors gaining
  P006. Other structured diagnostics remained identical.
- Complete five-file diff reviewed; diff hygiene passes and 23 open gap rows
  remain. GAP-002 and GAP-027 stay open. Independent review found no actionable
  findings and passed 91 focused tests plus 80 additional baseline compatibility,
  coordinate, EOF/comment and precedence checks. Publication verification is
  recorded below. The expected MIDI adapter-unavailable fixture passed.


### Subchain Validation Publication

- Implementation `13fa8b54002539df71ceffa34b4d894cb0a4573d`
  (`feat: expose structured subchain validation diagnostics`) contains only the
  five reviewed files. Pre-push pull/rebase did not change tested sources.
  Normal push succeeded and independent remote inspection confirmed the SHA.
- Exact-source [Shaders 36017840363](https://github.com/noisefactorllc/noisemaker/actions/runs/36017840363),
  [Docs site 36017840357](https://github.com/noisefactorllc/noisemaker/actions/runs/36017840357),
  [Site 36017840320](https://github.com/noisefactorllc/noisemaker/actions/runs/36017840320),
  and [Downstream 36017840207](https://github.com/noisefactorllc/noisemaker/actions/runs/36017840207)
  all passed. Shaders passed hosted tests, GPU tests, bundle creation and both
  release dispatches. Its exact-SHA artifact is nonempty (1,440,051 bytes) and
  unexpired. JavaScript CI was not triggered by these paths; local JS and lint
  passed. Inapplicable Dependabot auto-merge was skipped.
- [Scaffold library release 36018297071](https://github.com/noisefactorllc/scaffold/actions/runs/36018297071)
  passed for the exact implementation SHA, including 7/7 CDN edge purges.
  Static-site runs [36017859777](https://github.com/noisefactorllc/scaffold/actions/runs/36017859777)
  and [36018294941](https://github.com/noisefactorllc/scaffold/actions/runs/36018294941)
  passed for noisemaker-site, and [36017877111](https://github.com/noisefactorllc/scaffold/actions/runs/36017877111)
  passed for noisemaker-docs at the same SHA. Their optional CDN jobs were skipped
  by existing conditions; no separate live-site assertion is made.
- [Release 36018361328](https://github.com/noisefactorllc/noisemaker/actions/runs/36018361328)
  passed. The annotated `v1.0.177` tag resolves exactly to the implementation SHA.
  All eight expected desktop, shader, and JavaScript assets are nonempty; the
  release is neither draft nor prerelease. Shaders, library release and Release
  each used one sequential persistent `gh run watch --exit-status` process,
  all exiting 0. No manual dispatch or release was performed.

All selected subchain work is complete. GAP-002 remains active for remaining
parser throw paths, source-derived parser coordinates/spans and full-contract
verification. The gap register retains 23 open gaps, including GAP-027.
