# Active Framework Gap: GAP-031

Status: active

## Gap

**GAP-031 — Legacy MIDI note modes 0-4 do not enforce the documented integer channel range 1-16.**

Exact problem statement from `llms-full.txt`:

> Legacy MIDI note modes 0-4 do not enforce the documented integer channel range 1-16.

Agent consequence:

> A fractional, zero, or out-of-range channel in a legacy note mode compiles without a diagnostic and reads channel 1. CC and expression modes instead diagnose invalid channels and resolve to `min`.

## Source Files and Observed Behavior

- `shaders/src/lang/validator.js`: `compileAutomationDescriptor()` applies the static integer `1..16` channel predicate only when the resolved MIDI mode is `5` or greater.
- `shaders/src/runtime/external-input.js`: `MidiState.getChannel()` falls back to channel 1 when a compiled descriptor supplies a channel that does not exist.
- `shaders/tests/test_midi_audio_parser.js`: existing coverage rejects invalid channels for CC modes, but legacy note-mode coverage checks only valid channels and modes.
- Observed before implementation: legacy modes `0..4` accept boolean, fractional, zero, and out-of-range channel values without marking the descriptor invalid, allowing runtime fallback to channel 1.

## Backward-Compatibility Contract

- Preserve DSL parsing, expansion, saved programs, step indexes, and public result shapes.
- Preserve valid MIDI descriptors for every mode, including numeric mode values used by Noisedeck.
- Preserve the default channel value of 1 when a valid descriptor omits its channel through supported parser defaults.
- Preserve mode numbering, MIDI runtime state, unparse/format behavior, min/max/sensitivity handling, selected-port identity, and rendered output for valid programs.
- Do not change the runtime fallback used by direct internal callers; close the authoring gap at the compiler validation boundary.
- Invalid legacy descriptors may gain the same existing validation diagnostics and inert `_invalid` behavior already used by CC and expression modes.

## Objective Completion Criteria

- Every MIDI mode that uses a channel requires a static integer from 1 through 16.
- Legacy modes `0..4` diagnose boolean, fractional, zero, and out-of-range channels and mark the compiled descriptor inert.
- Valid boundary channels 1 and 16 continue to compile without diagnostics for legacy modes.
- Existing CC, expression, MPE, round-trip, identity, and numeric-mode behavior remains unchanged.
- Focused regression tests demonstrate the pre-fix acceptance and pass after the implementation.
- Required shader language, non-parity JavaScript, and lint checks pass.
- The exact pushed commit passes all required GitHub Actions checks triggered for the changed paths.

## Required Tests and CI Checks

- `node shaders/tests/test_midi_audio_parser.js`
- `npm run test:shaders:lang`
- `node scripts/run-js-tests.js --skip-parity`
- `npm run lint`
- GitHub Actions checks for the exact pushed commit, including Shaders, JavaScript, Docs site, Site, and Downstream workflows when triggered.

## Bounded Work Items

- [x] Add focused regressions for invalid and boundary legacy-mode channels, and verify that they fail for the current permissive behavior.
- [x] Apply the existing static integer `1..16` channel predicate to every channel-based MIDI mode.
- [x] Review the complete diff, run all required checks, and fix actionable findings.
- [ ] Update `llms-full.txt` only after evidence proves GAP-031 is closed.
- [ ] Commit only this run's files, rebase, push normally, and verify required CI for the exact pushed commit.

## Completed Evidence

- Checkout safety: `git status --porcelain=v2 --branch` reported clean `main` at `dfdc91a9`, synchronized with `origin/main`, with no active Git operation.
- Initial synchronization: `git pull --rebase` reported `Already up to date.`
- Target selection: the previous GAP-030 record was closed before this scheduled run. GAP-031 is repository-owned, correctness-focused, and bounded to the existing MIDI descriptor validation path and its adjacent parser/compiler tests.
- Root cause: `compileAutomationDescriptor()` selects `{allowBoolean:true}` for channels in modes `0..4`, while modes `5..10` use the documented static integer `1..16` predicate. Every channel-based mode is later resolved through the same `MidiState.getChannel()` table.
- Shade MCP availability check: no Shade MCP tool is exposed in this run. GAP-031 changes DSL validation rather than an effect definition or shader program, so repository language and JavaScript checks are the applicable executable evidence.
- Initial focused regression: `node shaders/tests/test_midi_audio_parser.js` exited `1`; legacy `noteChange` accepted channel `0` without an `S002` diagnostic or inert descriptor.
- Implementation: `compileAutomationDescriptor()` now applies the existing static integer `1..16` predicate to every channel-based MIDI mode. MPE zone selection continues to bypass channel compilation.
- Focused regression after the fix: `node shaders/tests/test_midi_audio_parser.js` exited `0` with 57 passed and 0 failed. It covers all five legacy note modes, invalid boolean/fractional/zero/out-of-range/static-type channels, and valid boundary channels 1 and 16.
- Complete diff review: valid descriptors, numeric aliases, channel defaults, MPE zone selectors, descriptor shapes, MIDI runtime state, and round-trip formatting remain unchanged. The only finding was overly specific evidence wording that named `S002` for all invalid types; the record now reflects the established `S001`/`S002` split.
- Shader language suite: `npm run test:shaders:lang` exited `0`, including the 57-case focused MIDI/audio parser suite and the 15-case nested automation suite.
- Non-parity JavaScript suite: `node scripts/run-js-tests.js --skip-parity` exited `0`, including the focused compiler regression, 58 external-input cases, nested automation, runtime pipeline coverage, and documentation source checks.
- Lint: `npm run lint` exited `0` with no diagnostics.

## Remaining Work

- Update the gap register after exact-commit CI confirms the implementation, close this record, and complete the commit/rebase/push/CI sequence.
