# Active Framework Gap: GAP-022

Status: active

## Gap

**GAP-022 — Mutation introspection exposes terminal builtins as replaceable steps.**

Exact problem statement from `llms-full.txt`:

> Mutation introspection includes terminal `write` as a replaceable nonstarter and exposes no node-kind field.

Agent consequence:

> Callers can target a builtin accidentally and cannot distinguish it structurally without string matching.

## Source Files and Observed Behavior

- `shaders/src/lang/transform.js`: `listSteps()` iterates every compiled chain node, including nodes with `builtin: true`, and reports `_write` as a replaceable nonstarter.
- `shaders/src/lang/transform.js`: the shared `findStepByIndex()` lookup also returns builtin nodes, so `replaceEffect()` and `getCompatibleReplacements()` accept a builtin step index as a mutation target.
- `shaders/src/lang/validator.js`: compiled terminal nodes already carry the structural `builtin: true` discriminator needed to exclude them without parsing operation names.
- `shaders/tests/test_transform.js`: the focused suite already expects effect-only lengths and currently fails because a two-effect chain produces three `listSteps()` entries; it lacks direct coverage for builtin indexes passed to mutation APIs.
- `package.json` and `scripts/run-js-tests.js`: the focused transform suite is not registered in the shader-language or non-parity aggregate routes.

## Backward-Compatibility Contract

- Preserve DSL behavior, rendered output, defaults, saved programs, compiled chain contents, and every existing effect step `temp` index.
- Preserve the existing `listSteps()`, `replaceEffect()`, and `getCompatibleReplacements()` result object fields and error shape.
- Restore the intended effect-only `listSteps()` contract by omitting compiled nodes already marked `builtin: true`; do not add an alias, alternate option, node-name heuristic, or new public discriminator field.
- Treat a builtin step index exactly like any other non-target index through the existing `Step with index <n> not found` result.
- Preserve inline surface-producer discovery and starter-position behavior.
- Do not change compilation, unparsing, effect definitions, shader programs, backends, rendered output, or the Python implementation.

## Objective Completion Criteria

- `listSteps()` returns only non-builtin effect steps for single-chain, multi-chain, and inline surface-producer programs.
- The returned effect steps keep their original `stepIndex`, `planIndex`, `chainIndex`, metadata, argument objects, and existing public result shape.
- `replaceEffect()` cannot target a compiled builtin index and returns the existing not-found failure shape without modifying the program.
- `getCompatibleReplacements()` cannot target a compiled builtin index and returns the existing not-found failure shape.
- A focused regression demonstrates the pre-change failures and passes after the minimal implementation.
- The focused regression runs in both the shader-language and non-parity JavaScript suites.
- Shader language tests, non-parity JavaScript tests, lint, documentation-path checks, and the exact pushed commit's required GitHub Actions checks pass.

## Required Tests and CI Checks

- `node shaders/tests/test_transform.js`
- `npm run test:shaders:lang`
- `node scripts/run-js-tests.js --skip-parity`
- `npm run lint`
- `node --test test/docs-static-paths.test.js` after changing `llms-full.txt`.
- GitHub Actions checks for the exact pushed commit, including every workflow triggered by the changed paths.

## Bounded Work Items

- [x] Strengthen and register the focused transform regression to cover preserved effect indexes and direct builtin targeting through both mutation APIs; verify the pre-change failures.
- [x] Filter compiled nodes marked `builtin: true` in `listSteps()` and the shared mutation lookup; verify the focused regression passes.
- [x] Review the complete diff and fix every actionable finding.
- [x] Run the focused and required repository checks.
- [x] Update `llms-full.txt` only after evidence proves GAP-022 is closed.
- [ ] Commit only this run's files, rebase, push normally, and verify required CI for the exact pushed commit.

## Completed Evidence

- Checkout safety: `git status --short --branch` reported clean `main` tracking `origin/main`, with no active merge, rebase, cherry-pick, or revert operation.
- Initial synchronization: `git pull --rebase` fast-forwarded `main` from `7ea31be3` to `c9136462` without conflicts.
- Target selection: the previous GAP-001 record was closed before this scheduled run. GAP-022 is repository-owned, correctness-focused, and bounded to existing mutation introspection.
- Shade MCP availability check: no Shade MCP tool is exposed in this run. This target changes DSL mutation introspection and does not modify effect definitions, shader programs, backends, or rendered output.
- Root-cause reproduction: `node shaders/tests/test_transform.js` exited `1`; the single-chain length expected 2 and received 3, and the two-chain length expected 4 and received 6.
- Structural evidence: the extra compiled terminal node has `op: "_write"`, `temp: 2`, and `builtin: true`. `listSteps()` currently reports it with `canReplaceWithNonStarter: true` because neither listing nor lookup checks the existing builtin flag.
- Focused red run after strengthening the regression: `node shaders/tests/test_transform.js` exited `1`. In addition to both length failures, `replaceEffect()` successfully replaced the builtin and `getCompatibleReplacements()` returned a successful candidate list for it.
- Minimal implementation: `findStepByIndex()` ignores compiled nodes with `builtin: true`, and `listSteps()` omits those same nodes. The implementation uses the validator's existing structural flag rather than operation-name matching and does not alter compiled chains or indexes.
- Aggregate registration: `package.json` runs `test_transform.js` in `test:shaders:lang`, and `scripts/run-js-tests.js` includes it once with `parity: false`.
- Focused green run: `node shaders/tests/test_transform.js` exited `0` with all 22 cases passing, including preserved effect indexes, effect-only lengths, builtin rejection through both mutation APIs, inline producer behavior, immutability, and namespace behavior.
- Independent review: two read-only high-reasoning passes found no Critical, Important, or Minor issues. The reviewer separately verified noncontiguous multi-chain indexes, a leading `read()` builtin, inline producers, exact failure shapes, compiled-program immutability, aggregate registration placement, JSON syntax, and failure propagation.
- Shader language suite: `npm run test:shaders:lang` exited `0` and executed the registered transform regression.
- Non-parity JavaScript suite: `node scripts/run-js-tests.js --skip-parity` exited `0` and executed the registered transform regression plus documentation source checks.
- Lint: `npm run lint` exited `0` with no diagnostics.
- Register closeout: `llms-full.txt` now documents effect-only mutation introspection and builtin-index rejection, removes GAP-022 from the traceability matrix and open table, and changes the open count from 24 to 23.
- Documentation and structure checks: `node --test test/docs-static-paths.test.js` exited `0` with 4 passed and 0 failed; `package.json` parsed as JSON; each aggregate route contains exactly one transform-suite registration; the open table contains 23 rows; GAP-022 appears once in its closure note; and `git diff --check` exited `0`.

## Remaining Work

Commit the verified bounded work, rebase, push normally, and verify required CI for the exact pushed commit. Keep the target active until those checks pass.
