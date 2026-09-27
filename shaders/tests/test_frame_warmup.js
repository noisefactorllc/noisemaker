#!/usr/bin/env node
/**
 * GAP-014 focused regressions: the warmup/pause ordering contract that
 * keeps the harness `renderEffectFrame` wrapper
 * (shaders/tests/test-harness.js) from hanging when a caller requests a
 * positive explicit `time` together with warmup frames
 * (shaders/tests/frame-warmup.js, mirrored from the wrapper).
 *
 * The upstream Shade MCP verb (`vendor/shade-mcp/harness/index.js`, built
 * from `src/tools/browser/render.ts`) pauses animation BEFORE awaiting its
 * frame-count warmup promise; when pausing stops the frame loop the
 * promise never resolves and the tool hangs. These regressions pin the
 * repository-side resolution: hang-risk detection, the explicit-time
 * routing rule, the warmup-before-pause ordering, and source guards that
 * keep the wrapper on the safe path.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
    isHangRiskTime,
    needsSafeWarmupPath,
    warmupPausePlan,
} from './frame-warmup.js'

// ---------------------------------------------------------------------------
// isHangRiskTime: the register row's hang condition.
// ---------------------------------------------------------------------------

assert.equal(isHangRiskTime(1), true)
assert.equal(isHangRiskTime(0.5), true)
assert.equal(isHangRiskTime(12.5), true)
assert.equal(isHangRiskTime(0), false)
assert.equal(isHangRiskTime(-1), false)
assert.equal(isHangRiskTime(Number.NaN), false)
assert.equal(isHangRiskTime(Number.POSITIVE_INFINITY), false)
assert.equal(isHangRiskTime('1'), false)
assert.equal(isHangRiskTime(null), false)
assert.equal(isHangRiskTime(undefined), false)

// ---------------------------------------------------------------------------
// needsSafeWarmupPath: any explicit `time` routes through the repository
// path; absent time keeps the historical routing.
// ---------------------------------------------------------------------------

assert.equal(needsSafeWarmupPath({ time: 2 }), true)
assert.equal(needsSafeWarmupPath({ time: 0 }), true)
assert.equal(needsSafeWarmupPath({ time: -1 }), true)
assert.equal(needsSafeWarmupPath({}), false)
assert.equal(needsSafeWarmupPath({ warmupFrames: 10 }), false)
assert.equal(needsSafeWarmupPath(undefined), false)
assert.equal(needsSafeWarmupPath(null), false)
assert.equal(needsSafeWarmupPath('no'), false)

// ---------------------------------------------------------------------------
// warmupPausePlan: explicit-time requests take the repository path and
// warm up BEFORE pausing; time-less requests are unchanged.
// ---------------------------------------------------------------------------

// The hang-shaped request: positive explicit time plus warmup frames.
assert.deepEqual(
    warmupPausePlan({ time: 2, warmupFrames: 10 }),
    { useRepositoryPath: true, warmupBeforePause: true, pauseAtTime: 2 },
)

// Zero and negative explicit times still take the safe path.
assert.deepEqual(
    warmupPausePlan({ time: 0 }),
    { useRepositoryPath: true, warmupBeforePause: true, pauseAtTime: 0 },
)
assert.deepEqual(
    warmupPausePlan({ time: -1 }),
    { useRepositoryPath: true, warmupBeforePause: true, pauseAtTime: -1 },
)

// No explicit time: repository path is not forced, nothing pauses.
assert.deepEqual(
    warmupPausePlan({ warmupFrames: 10 }),
    { useRepositoryPath: false, warmupBeforePause: true, pauseAtTime: null },
)
assert.deepEqual(
    warmupPausePlan({}),
    { useRepositoryPath: false, warmupBeforePause: true, pauseAtTime: null },
)
assert.deepEqual(
    warmupPausePlan(),
    { useRepositoryPath: false, warmupBeforePause: true, pauseAtTime: null },
)

// Non-object options never crash the plan.
assert.deepEqual(
    warmupPausePlan(null),
    { useRepositoryPath: false, warmupBeforePause: true, pauseAtTime: null },
)

// The plan is a plain data object, safe to inspect and serialize.
assert.equal(
    JSON.stringify(warmupPausePlan({ time: 3 })),
    '{"useRepositoryPath":true,"warmupBeforePause":true,"pauseAtTime":3}',
)

// ---------------------------------------------------------------------------
// Source guards: the wrapper in shaders/tests/test-harness.js must keep the
// safe path wired — the mirror import present, the upstream verb delegation
// guarded against explicit-time requests, and the pause block placed AFTER
// the awaited frame-count warmup.
// ---------------------------------------------------------------------------

const harnessSource = fs.readFileSync(
    new URL('./test-harness.js', import.meta.url),
    'utf8',
)

// The wrapper imports the mirror.
assert.match(
    harnessSource,
    /import\s*\{[^}]*warmupPausePlan[^}]*\}\s*from\s*'\.\/frame-warmup\.js'/,
)

// The upstream verb delegation is guarded by the plan, so explicit-time
// requests never reach the pause-before-warmup verb.
const wrapperStart = harnessSource.indexOf(
    'async function renderEffectFrame(session, effectId, options = {}) {',
)
assert.notEqual(wrapperStart, -1, 'wrapper function must exist')
const wrapperSource = harnessSource.slice(wrapperStart, wrapperStart + 4000)
assert.match(
    wrapperSource,
    /!\s*plan\.useRepositoryPath[\s\S]{0,200}shadeRenderEffectFrame/,
    'upstream verb delegation must be guarded by !plan.useRepositoryPath',
)

// Inside the repository path, the frame-count warmup await comes before the
// pause block (the historical pause-before-warmup ordering was the hang).
const pauseIndex = wrapperSource.indexOf('window[globals.setPaused]')
const warmupIndex = wrapperSource.indexOf('window[globals.frameCount]')
assert.notEqual(pauseIndex, -1, 'pause block must exist')
assert.notEqual(warmupIndex, -1, 'warmup block must exist')
assert.ok(
    warmupIndex < pauseIndex,
    'warmup block must be sourced before the pause block (warmup-before-pause)',
)

console.log('PASS test_frame_warmup: 5 groups (hang-risk, routing, plan, source guards, serialization)')
