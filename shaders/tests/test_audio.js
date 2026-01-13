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

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed')
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
        audio: true,
        band: 0,  // low
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 0.7, 0.01, 'should return low band value')
})

test('low band maps to min/max range', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.low = 0.5

    const config = {
        audio: true,
        band: 0,  // low
        min: 2,
        max: 10
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // 0.5 * (10-2) + 2 = 6
    assertApprox(result, 6, 0.01, 'should map to range')
})

// ============================================================================
// Audio Band: mid (band 1)
// ============================================================================

console.log('\n=== Audio Band: mid (1) ===\n')

test('mid band returns mid frequency value', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.mid = 0.4

    const config = {
        audio: true,
        band: 1,  // mid
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 0.4, 0.01, 'should return mid band value')
})

test('mid band maps to min/max range', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.mid = 0.25

    const config = {
        audio: true,
        band: 1,  // mid
        min: 0,
        max: 100
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // 0.25 * 100 = 25
    assertApprox(result, 25, 0.01, 'should map to range')
})

// ============================================================================
// Audio Band: high (band 2)
// ============================================================================

console.log('\n=== Audio Band: high (2) ===\n')

test('high band returns high frequency value', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.high = 0.9

    const config = {
        audio: true,
        band: 2,  // high
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 0.9, 0.01, 'should return high band value')
})

test('high band maps to min/max range', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.high = 1.0

    const config = {
        audio: true,
        band: 2,  // high
        min: -5,
        max: 5
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // 1.0 * 10 + (-5) = 5
    assertApprox(result, 5, 0.01, 'should map to range')
})

// ============================================================================
// Audio Band: vol (band 3)
// ============================================================================

console.log('\n=== Audio Band: vol (3) ===\n')

test('vol band returns overall volume', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.vol = 0.65

    const config = {
        audio: true,
        band: 3,  // vol
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 0.65, 0.01, 'should return vol value')
})

test('vol band maps to min/max range', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.vol = 0.8

    const config = {
        audio: true,
        band: 3,  // vol
        min: 1,
        max: 11
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // 0.8 * 10 + 1 = 9
    assertApprox(result, 9, 0.01, 'should map to range')
})

// ============================================================================
// Edge Cases
// ============================================================================

console.log('\n=== Edge Cases ===\n')

test('audio returns min when no audio state set', () => {
    const pipeline = new Pipeline(null, null)
    // No audio state set

    const config = {
        audio: true,
        band: 0,
        min: 5,
        max: 10
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertEqual(result, 5, 'should return min when no audio state')
})

test('audio handles zero values', () => {
    const { pipeline, audioState } = createTestPipeline()

    audioState.low = 0

    const config = {
        audio: true,
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
        audio: true,
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
        audio: true,
        band: 2,
        min: 0,
        max: 10
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // Should clamp to max
    assertEqual(result, 10, 'should clamp to max for values > 1')
})

test('audio defaults band values correctly', () => {
    const { pipeline, audioState } = createTestPipeline()
    
    // AudioState initializes all bands to 0
    const config = {
        audio: true,
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
