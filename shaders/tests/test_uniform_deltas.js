#!/usr/bin/env node
/**
 * GAP-011 focused regressions: the repository-side uniform responsiveness
 * measurement (shaders/tests/uniform-deltas.js) reports the measured luma
 * and per-channel deltas in the result, so the `>0.002` response threshold
 * is auditable from the report alone — the upstream Shade tool
 * (vendor/shade-mcp/harness/index.js, `testUniformResponsiveness()`)
 * reports only `name:pass`/`name:fail` strings.
 */
import assert from 'node:assert/strict'

import {
    UNIFORM_RESPONSE_THRESHOLD,
    auditUniformResponsiveness,
    classifyMeasuredUniforms,
    meanChannels,
    measureUniformDeltas,
} from './uniform-deltas.js'

// The threshold is the upstream tool's exact value and is exported for audit.
assert.equal(UNIFORM_RESPONSE_THRESHOLD, 0.002)

// meanChannels matches the upstream full-grid mean computation exactly.
// A 2x1 frame with RGBA bytes (255,0,0,255) and (0,255,0,255):
assert.deepEqual(meanChannels(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1), [0.5, 0.5, 0])
// A 1x1 opaque white frame:
assert.deepEqual(meanChannels(new Uint8Array([255, 255, 255, 255]), 1, 1), [1, 1, 1])
// A 2x2 black frame:
assert.deepEqual(
    meanChannels(new Uint8Array(16), 2, 2),
    [0, 0, 0],
)

// A uniform that moves every channel equally produces a luma delta.
const white = [1, 1, 1]
const black = [0, 0, 0]
assert.deepEqual(
    measureUniformDeltas(black, white),
    { luma_diff: 1, max_channel_diff: 1, responds: true },
)

// A channel-only change (luma-neutral) is still caught by max_channel_diff.
const swapped = [1, 0, 1]
assert.deepEqual(
    measureUniformDeltas([0, 1, 0], swapped),
    { luma_diff: 1 / 3, max_channel_diff: 1, responds: true },
)

// A sub-threshold change does not count as a response (strictly greater).
const tiny = measureUniformDeltas([0.5, 0.5, 0.5], [0.5 + 0.001, 0.5 + 0.001, 0.5 + 0.001])
assert.equal(tiny.responds, false)
assert.ok(Math.abs(tiny.luma_diff - 0.001) < 1e-12)

// Exactly at the threshold is not a response: the comparison is `>` 0.002.
const exact = measureUniformDeltas([0, 0, 0], [0.002, 0.002, 0.002])
assert.equal(exact.responds, false)
// Just above it is.
const justAbove = measureUniformDeltas([0, 0, 0], [0.002, 0.002, 0.002 + 1e-9])
assert.equal(justAbove.responds, true)
// A luma-neutral channel swing above the threshold responds on max_channel_diff.
const lumaNeutral = measureUniformDeltas([0.5, 0.5, 0.5], [0.5 + 0.003, 0.5 - 0.003, 0.5])
assert.equal(lumaNeutral.luma_diff, 0)
assert.equal(lumaNeutral.responds, true)

// Repository-side classification is truthful from every entry (GAP-010
// semantics), including all-`:fail` shapes the upstream outer status hides.
assert.equal(
    classifyMeasuredUniforms({
        uniform_deltas: [{ name: 'a', responds: true }, { name: 'b', responds: true }],
    }),
    'ok',
)
assert.equal(
    classifyMeasuredUniforms({
        uniform_deltas: [{ name: 'a', responds: false }, { name: 'b', responds: true }],
    }),
    'fail',
)
assert.equal(
    classifyMeasuredUniforms({ uniform_deltas: [{ name: 'a', responds: null }] }),
    'error',
)
assert.equal(classifyMeasuredUniforms({ uniform_deltas: [] }), 'skipped')
assert.equal(classifyMeasuredUniforms({ error: 'Failed to capture baseline', uniform_deltas: [] }), 'error')
assert.equal(classifyMeasuredUniforms(null), 'error')

// The audit cross-checks upstream verdicts against measured deltas...
assert.deepEqual(
    auditUniformResponsiveness(
        { tested_uniforms: ['scale:pass', 'offset:fail'] },
        { uniform_deltas: [{ name: 'scale', responds: true }, { name: 'offset', responds: false }] },
    ),
    { mismatches: [] },
)

// ...and reports an upstream verdict the measured deltas contradict.
assert.deepEqual(
    auditUniformResponsiveness(
        { tested_uniforms: ['scale:pass', 'offset:pass'] },
        { uniform_deltas: [{ name: 'scale', responds: true }, { name: 'offset', responds: false }] },
    ),
    { mismatches: [{ name: 'offset', upstream: 'pass', measured: 'flat' }] },
)
assert.deepEqual(
    auditUniformResponsiveness(
        { tested_uniforms: ['scale:fail'] },
        { uniform_deltas: [{ name: 'scale', responds: true }] },
    ),
    { mismatches: [{ name: 'scale', upstream: 'fail', measured: 'responds' }] },
)

// Unmeasured and errored entries are skipped, never invented as mismatches.
assert.deepEqual(
    auditUniformResponsiveness(
        { tested_uniforms: ['scale:pass', 'offset:error', 'ghost:pass'] },
        { uniform_deltas: [{ name: 'scale', responds: true }, { name: 'offset', responds: null }] },
    ),
    { mismatches: [] },
)
assert.deepEqual(auditUniformResponsiveness(null, null), { mismatches: [] })

console.log('test_uniform_deltas.js: all assertions passed')
