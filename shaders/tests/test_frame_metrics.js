#!/usr/bin/env node
/**
 * GAP-009 focused regressions: the temporal no-animation and universal
 * low-variety metric predicates returned by the harness's
 * `renderEffectFrame` wrapper (shaders/tests/test-harness.js).
 *
 * The thresholds must stay identical to the existing shade-mcp filter
 * modification predicate (vendor/shade-mcp/harness/index.js,
 * `testNoPassthrough()`: temporalDiff > 0.01 OR uniqueColors > 5), which is
 * the only source-grounded temporal/color boundary in the repository.
 */
import assert from 'node:assert/strict'

import {
    NO_ANIMATION_TEMPORAL_DIFF_MAX,
    LOW_VARIETY_MAX_UNIQUE_COLORS,
    computeTemporalDiff,
    isNoAnimation,
    isLowVariety,
} from './frame-metrics.js'

// Grounded thresholds: exactly the filter modification predicate values.
assert.equal(NO_ANIMATION_TEMPORAL_DIFF_MAX, 0.01)
assert.equal(LOW_VARIETY_MAX_UNIQUE_COLORS, 5)

// computeTemporalDiff: identical frames differ by zero.
assert.equal(computeTemporalDiff([10, 20, 30, 200, 100, 0], [10, 20, 30, 200, 100, 0]), 0)

// computeTemporalDiff: known value. Two samples, diffs (10+10+10) and
// (0+0+255) => 295 / (2 samples * 3 channels * 255).
const expected = (10 + 10 + 10 + 0 + 0 + 255) / (2 * 3 * 255)
assert.ok(Math.abs(computeTemporalDiff([0, 0, 0, 100, 100, 100], [10, 10, 10, 100, 100, 355]) - expected) < 1e-12)

// computeTemporalDiff: full-scale flip is exactly 1.
assert.equal(computeTemporalDiff([0, 0, 0], [255, 255, 255]), 1)

// computeTemporalDiff: rejects malformed inputs instead of inventing a value.
assert.throws(() => computeTemporalDiff([], []))
assert.throws(() => computeTemporalDiff([0, 0, 0], [0, 0]))
assert.throws(() => computeTemporalDiff(null, [0, 0, 0]))

// isNoAnimation: boundary is inclusive (modifying is strictly > 0.01).
assert.equal(isNoAnimation(0), true)
assert.equal(isNoAnimation(0.01), true)
assert.equal(isNoAnimation(0.0100001), false)
assert.equal(isNoAnimation(0.5), false)
assert.throws(() => isNoAnimation(null))
assert.throws(() => isNoAnimation(Number.NaN))

// isLowVariety: boundary is inclusive (modifying is strictly > 5 colors).
assert.equal(isLowVariety(1), true)
assert.equal(isLowVariety(5), true)
assert.equal(isLowVariety(6), false)
assert.equal(isLowVariety(1001), false)
assert.throws(() => isLowVariety(-1))
assert.throws(() => isLowVariety(2.5))

// The harness wrapper consumes the predicates: its module must reference
// them (guards against the augmentation being disconnected silently).
const harnessSource = (await import('node:fs')).readFileSync(
    new URL('./test-harness.js', import.meta.url), 'utf-8')
assert.ok(harnessSource.includes('augmentFrameMetrics'))
assert.ok(harnessSource.includes("from './frame-metrics.js'"))
assert.ok(harnessSource.includes('metrics.temporal_diff'))
assert.ok(harnessSource.includes('metrics.is_no_animation'))
assert.ok(harnessSource.includes('metrics.is_low_variety'))
// The gate must remain opt-in: no default path enables it.
assert.ok(harnessSource.includes("arg === '--low-variety'"))
assert.ok(!/runLowVariety:\s*true/.test(harnessSource.replace("parsed.runLowVariety = true", '')))

console.log('GAP-009 frame-metric regressions: PASS')
