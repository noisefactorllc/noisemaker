/**
 * Tests for Audio Evaluation in the Pipeline
 *
 * Tests the evaluateAudio() function and Audio integration with resolveUniformValue().
 */

import { Pipeline } from '../src/runtime/pipeline.js'
import { AudioState } from '../src/runtime/external-input.js'

let passCount = 0
let failCount = 0

function test(name, fn) {
    try {
        fn()
        console.log(`PASS: ${name}`)
        passCount++
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e.message)
        failCount++
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

function assertApprox(actual, expected, tolerance = 0.01, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message || 'Assertion failed'}: expected ~${expected}, got ${actual}`)
    }
}

// Helper to create a test pipeline with Audio state
function createTestPipeline() {
    const pipeline = new Pipeline(null, null)
    const audioState = new AudioState()
    pipeline.setAudioState(audioState)
    return { pipeline, audioState }
}

// ============================================================================
// Audio Band: low (band 0)
// ============================================================================

console.log('\n=== Audio Band: low (0) ===\n')

test('low band returns low frequency value', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.low = 0.7

    const config = {
        type: 'Audio',
        band: 0,  // low
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 0.7, 0.01, 'should return low band value')
})

test('low band maps to non-trivial percentage range', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.low = 0.5

    const config = {
        type: 'Audio',
        band: 0,  // low
        min: 0.2,
        max: 0.8
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // pct = 0.2 + 0.5 * (0.8 - 0.2) = 0.5
    assertApprox(result, 0.5, 0.01, 'should map to percentage range')
})

// ============================================================================
// Audio Band: mid (band 1)
// ============================================================================

console.log('\n=== Audio Band: mid (1) ===\n')

test('mid band returns mid frequency value', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.mid = 0.4

    const config = {
        type: 'Audio',
        band: 1,  // mid
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 0.4, 0.01, 'should return mid band value')
})

test('mid band maps to non-trivial percentage range', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.mid = 1.0

    const config = {
        type: 'Audio',
        band: 1,  // mid
        min: 0.3,
        max: 0.7
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // pct = 0.3 + 1.0 * (0.7 - 0.3) = 0.7
    assertApprox(result, 0.7, 0.01, 'should map to percentage range')
})

// ============================================================================
// Audio Band: high (band 2)
// ============================================================================

console.log('\n=== Audio Band: high (2) ===\n')

test('high band returns high frequency value', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.high = 0.9

    const config = {
        type: 'Audio',
        band: 2,  // high
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 0.9, 0.01, 'should return high band value')
})

test('high band maps to non-trivial percentage range', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.high = 0.0

    const config = {
        type: 'Audio',
        band: 2,  // high
        min: 0.1,
        max: 0.9
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // pct = 0.1 + 0.0 * (0.9 - 0.1) = 0.1
    assertApprox(result, 0.1, 0.01, 'should map to percentage range')
})

// ============================================================================
// Audio Band: vol (band 3)
// ============================================================================

console.log('\n=== Audio Band: vol (3) ===\n')

test('vol band returns overall volume', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.vol = 0.65

    const config = {
        type: 'Audio',
        band: 3,  // vol
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 0.65, 0.01, 'should return vol value')
})

test('vol band maps to non-trivial percentage range', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.vol = 0.5

    const config = {
        type: 'Audio',
        band: 3,  // vol
        min: 0.0,
        max: 0.5
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // pct = 0.0 + 0.5 * (0.5 - 0.0) = 0.25
    assertApprox(result, 0.25, 0.01, 'should map to percentage range')
})

// ============================================================================
// Percentage Scaling Tests
// ============================================================================

console.log('\n=== Percentage Scaling ===\n')

test('resolveUniformValue scales percentage by paramSpec', () => {
    const { pipeline, audioState } = createTestPipeline()
    audioState.low = 0.5

    const config = {
        type: 'Audio',
        band: 0,  // low
        min: 0,   // 0% (percentage)
        max: 1    // 100% (percentage)
    }
    const paramSpec = { min: 10, max: 50 }

    const result = pipeline.resolveUniformValue(config, 0, paramSpec)
    // audio raw = 0.5, pct = 0 + 0.5 * 1 = 0.5, output = 10 + 0.5 * 40 = 30
    assertApprox(result, 30, 0.01, 'should scale percentage by paramSpec')
})

test('resolveUniformValue with partial percentage range', () => {
    const { pipeline, audioState } = createTestPipeline()
    audioState.low = 0.5

    const config = {
        type: 'Audio',
        band: 0,
        min: 0.25,  // 25%
        max: 0.75   // 75%
    }
    const paramSpec = { min: 0, max: 100 }

    const result = pipeline.resolveUniformValue(config, 0, paramSpec)
    // audio raw = 0.5, pct = 0.25 + 0.5 * 0.5 = 0.5, output = 0 + 0.5 * 100 = 50
    assertApprox(result, 50, 0.01, 'should scale partial percentage by paramSpec')
})

test('resolveUniformValue without paramSpec returns raw percentage', () => {
    const { pipeline, audioState } = createTestPipeline()
    audioState.low = 0.5

    const config = {
        type: 'Audio',
        band: 0,
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // No paramSpec, returns raw percentage
    assertApprox(result, 0.5, 0.01, 'should return raw percentage without paramSpec')
})

// ============================================================================
// Edge Cases
// ============================================================================

console.log('\n=== Edge Cases ===\n')

test('audio returns min when no audio state set', () => {
    const pipeline = new Pipeline(null, null)
    // No audio state set

    const config = {
        type: 'Audio',
        band: 0,
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertEqual(result, 0, 'should return 0% when no audio state')
})

test('audio handles zero values', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.low = 0

    const config = {
        type: 'Audio',
        band: 0,
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertEqual(result, 0, 'should return 0 for zero audio level')
})

test('audio handles max values', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.mid = 1.0

    const config = {
        type: 'Audio',
        band: 1,
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertEqual(result, 1, 'should return 1 for max audio level')
})

test('audio clamps values above 1', () => {
    const { pipeline, audioState } = createTestPipeline()

    // Simulate audio spike above 1.0
    audioState.high = 1.5

    const config = {
        type: 'Audio',
        band: 2,
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // rawValue clamped to 1.0, percentage = 0 + 1.0 * 1 = 1.0
    assertEqual(result, 1, 'should clamp to max percentage for values > 1')
})

test('audio defaults band values correctly', () => {
    const { pipeline } = createTestPipeline()

    // AudioState initializes all bands to 0
    const config = {
        type: 'Audio',
        band: 0,
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertEqual(result, 0, 'should return 0 for default audio state')
})

// ============================================================================
// Summary
// ============================================================================

console.log('\n=== Test Summary ===')
console.log(`Passed: ${passCount}`)
console.log(`Failed: ${failCount}`)

if (failCount > 0) {
    process.exit(1)
}
