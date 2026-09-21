# Active Framework Gap: GAP-013

Status: closed

## Gap

**GAP-013 — Noisemaker MCP config tracks an unpinned GitHub package reference.**

Exact problem statement from `llms-full.txt`:

> Noisemaker MCP config tracks an unpinned GitHub package reference.

Agent consequence:

> Tool schemas/thresholds can drift independently of this document snapshot.

## Source Files and Observed Behavior

- `.mcp.json`: the Shade server uses `github:noisedeck/shade-mcp` without a tag or commit selector.
- GitHub currently resolves `noisedeck/shade-mcp` `main` and the peeled `v0.2.3` tag to `cbcab33363851016f65391fbb9ef71d66729c07f`.
- Observed before implementation: a semantic configuration check requiring `github:noisedeck/shade-mcp#<40-hex-commit>` fails on the floating package reference.
- `scripts/run-js-tests.js`: the non-parity test route has no regression guarding the MCP dependency contract.

## Backward-Compatibility Contract

- Preserve DSL behavior, rendered output, defaults, saved programs, step indexes, and public result shapes.
- Preserve the `shade` server name, `npx` command, `-y` argument, relative environment paths, viewer path, and globals prefix.
- Resolve the same current Shade MCP release while replacing branch-tip drift with an immutable full commit selector.
- Do not vendor Shade, add a second MCP configuration, add an alias, or change any Shade tool schema or threshold in this repository.

## Objective Completion Criteria

- `.mcp.json` identifies Shade MCP with a full 40-character lowercase commit SHA.
- The pinned SHA exists upstream and is the commit selected for this run.
- The pinned package installs and starts through the configured `npx` entrypoint with the existing environment contract.
- A focused regression fails on the pre-change floating reference and passes on the pinned reference.
- The regression runs in the non-parity JavaScript route.
- Non-parity JavaScript, lint, configuration smoke, and documentation-path checks pass.
- The exact pushed commit passes all required GitHub Actions checks triggered for the changed paths.

## Required Tests and CI Checks

- `node --test test/mcp-config.test.js`
- `node scripts/run-js-tests.js --skip-parity`
- `npm run lint`
- A clean-stdin `npx -y <pinned-package-reference>` startup smoke check.
- `node --test test/docs-static-paths.test.js` after changing `llms-full.txt`.
- GitHub Actions checks for the exact pushed commit, including JavaScript and any other workflows triggered for the changed paths.

## Bounded Work Items

- [x] Add and register a semantic regression requiring the Shade GitHub package reference to use a full commit SHA; verify the pre-change failure.
- [x] Pin the existing Shade MCP package reference to the selected upstream commit without changing its command or environment.
- [x] Verify the pinned package entrypoint, review the complete diff, and run all required checks.
- [x] Update `llms-full.txt` only after evidence proves GAP-013 is closed.
- [x] Commit only this run's files, rebase, push normally, and verify required CI for the exact pushed commit.

## Completed Evidence

- Checkout safety: `git status --short --branch` reported clean `main` tracking `origin/main`, with no active merge, rebase, cherry-pick, or revert operation.
- Initial synchronization: `git pull --rebase` reported `Already up to date.`
- Target selection: the previous GAP-028 record was closed before this scheduled run. GAP-013 is repository-owned, reliability-focused, bounded to the existing MCP configuration, and does not require unavailable Shade shader-development tools.
- Shade MCP availability check: no Shade MCP tool is exposed in this run. This target changes only how the existing external server package is resolved; it does not modify or validate shader source.
- Upstream identity: `git ls-remote` reported `cbcab33363851016f65391fbb9ef71d66729c07f` for both Shade MCP `HEAD`/`main` and the peeled `v0.2.3` tag.
- Focused red check: the semantic pin assertion exited `1` and reported `Shade package reference is not pinned to a full commit: github:noisedeck/shade-mcp`.
- Focused committed-test red run: `node --test test/mcp-config.test.js` exited `1` with 0 passed and 1 failed because the floating package reference did not match the immutable full-commit contract.
- Implementation: `.mcp.json` now selects `github:noisedeck/shade-mcp#cbcab33363851016f65391fbb9ef71d66729c07f`; the server name, command, argument order, relative environment paths, viewer path, and globals prefix are unchanged.
- Focused green run: `node --test test/mcp-config.test.js` exited `0` with 1 passed and 0 failed. The regression also asserts the existing `npx -y` invocation shape and is registered in the non-parity JavaScript runner.
- Package smoke: `printf '' | npx -y 'github:noisedeck/shade-mcp#cbcab33363851016f65391fbb9ef71d66729c07f'` completed the Git package preparation, launched the configured binary with clean stdin, and exited `0`.
- Complete diff review found one documentation consistency issue: the configured `v0.2.3` commit differs from the older audited Shade MCP source snapshot recorded by `llms-full.txt`. The closeout text now preserves both exact revisions and states that the configured server is not freshness evidence for the different audited snapshot. No runtime or test issue remained.
- Non-parity JavaScript suite: `node scripts/run-js-tests.js --skip-parity` exited `0`, including the new MCP configuration regression, shader runtime and language coverage, CPU JavaScript coverage, and documentation source checks.
- Lint: `npm run lint` exited `0` with no diagnostics.
- Register closeout: `llms-full.txt` records the immutable configured revision, removes GAP-013 from the open-gap table and matrix, and changes the open count from 26 to 25 without claiming the configured revision was fully re-audited for the older contract snapshot.
- Closeout documentation check: `node --test test/docs-static-paths.test.js` exited `0` with 4 passed and 0 failed.
- Register structure check counted exactly 25 open gap rows, `.mcp.json` parsed successfully, and `git diff --check` exited `0`.
- Implementation commit: `7706a71577866a65b010b930ae6d8f8e2c8e0392` (`chore: pin Shade MCP dependency`).
- Pre-push synchronization: `git pull --rebase` reported `Current branch main is up to date.` The tested source did not change.
- Push: the normal `git push origin main` advanced `main` from `2f855c9c` to `7706a715`.
- Exact-commit CI: GitHub Actions run `35572206261` (`JavaScript`) completed successfully for `7706a71577866a65b010b930ae6d8f8e2c8e0392`. Lint, non-parity tests, browser and CLI bundle builds, Linux/macOS/Windows standalone builds, artifact uploads, and snapshot publication passed. No other workflow was triggered for the changed paths.

## Remaining Work

None. All GAP-013 completion criteria passed. Select the next gap only in a later scheduled run.
