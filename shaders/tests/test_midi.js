/**
 * Tests for MIDI Evaluation in the Pipeline
 *
 * Tests the evaluateMidi() function and MIDI integration with resolveUniformValue().
 */

import { Pipeline } from '../src/runtime/pipeline.js'
import { MidiState } from '../src/runtime/external-input.js'

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

// Helper to create a test pipeline with MIDI state
function createTestPipeline() {
    const pipeline = new Pipeline(null, null)
    const midiState = new MidiState()
    pipeline.setMidiState(midiState)
    return { pipeline, midiState }
}

// ============================================================================
// MIDI Mode: noteChange (mode 0)
// ============================================================================

console.log('\n=== MIDI Mode: noteChange (0) ===\n')

test('noteChange returns note value regardless of gate', () => {
    const { pipeline, midiState } = createTestPipeline()

    // Set up channel 1 with a note (gate off)
    midiState.getChannel(1).key = 60
    midiState.getChannel(1).gate = 0

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 0,  // noteChange
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // 60/127 ≈ 0.472
    assertApprox(result, 60 / 127, 0.01, 'should return note value even with gate off')
})

test('noteChange maps to min/max range', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).key = 127  // Max MIDI note

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 0,
        min: 0,
        max: 10,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 10, 0.01, 'should map max note to max value')
})

// ============================================================================
// MIDI Mode: gateNote (mode 1)
// ============================================================================

console.log('\n=== MIDI Mode: gateNote (1) ===\n')

test('gateNote returns note value when gate is on', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).noteOn(64, 100)

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 1,  // gateNote
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 64 / 127, 0.01, 'should return note value when gate on')
})

test('gateNote returns min when gate is off', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).key = 64
    midiState.getChannel(1).gate = 0

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 1,  // gateNote
        min: 5,
        max: 10,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertEqual(result, 5, 'should return min when gate off')
})

// ============================================================================
// MIDI Mode: gateVelocity (mode 2)
// ============================================================================

console.log('\n=== MIDI Mode: gateVelocity (2) ===\n')

test('gateVelocity returns velocity when gate is on', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).noteOn(60, 100)

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 2,  // gateVelocity
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 100 / 127, 0.01, 'should return velocity when gate on')
})

test('gateVelocity returns min when gate is off', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).velocity = 100
    midiState.getChannel(1).gate = 0

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 2,  // gateVelocity
        min: 0,
        max: 10,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertEqual(result, 0, 'should return min when gate off')
})

// ============================================================================
// MIDI Mode: triggerNote (mode 3)
// ============================================================================

console.log('\n=== MIDI Mode: triggerNote (3) ===\n')

test('triggerNote returns full note value immediately after note on', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).noteOn(64, 100)
    // time is now, so elapsed is ~0

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 3,  // triggerNote
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // With ~0 elapsed time, should be close to full value
    assertApprox(result, 64 / 127, 0.05, 'should return ~full note value immediately')
})

test('triggerNote decays over time', () => {
    const { pipeline, midiState } = createTestPipeline()

    // Simulate note on 500ms ago
    midiState.getChannel(1).key = 127
    midiState.getChannel(1).velocity = 127
    midiState.getChannel(1).gate = 1
    midiState.getChannel(1).time = Date.now() - 500

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 3,  // triggerNote
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // With sensitivity=1 and 500ms elapsed: decay = min(1, 500 * 1 * 0.001) = 0.5
    // value = 127 * (1 - 0.5) = 63.5, normalized = 63.5/127 ≈ 0.5
    assertApprox(result, 0.5, 0.1, 'should decay to ~half after 500ms')
})

test('triggerNote higher sensitivity decays faster', () => {
    const { pipeline, midiState } = createTestPipeline()

    // Simulate note on 250ms ago
    midiState.getChannel(1).key = 127
    midiState.getChannel(1).gate = 1
    midiState.getChannel(1).time = Date.now() - 250

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 3,  // triggerNote
        min: 0,
        max: 1,
        sensitivity: 4  // 4x faster decay
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // decay = min(1, 250 * 4 * 0.001) = 1.0 (clamped)
    // value = 127 * (1 - 1) = 0
    assertApprox(result, 0, 0.05, 'should fully decay with high sensitivity')
})

// ============================================================================
// MIDI Mode: velocity (mode 4) - Default
// ============================================================================

console.log('\n=== MIDI Mode: velocity (4) ===\n')

test('velocity returns full velocity immediately after note on', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).noteOn(60, 100)

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 4,  // velocity
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 100 / 127, 0.05, 'should return ~full velocity immediately')
})

test('velocity decays over time', () => {
    const { pipeline, midiState } = createTestPipeline()

    // Simulate note on 1000ms ago with full velocity
    midiState.getChannel(1).velocity = 127
    midiState.getChannel(1).gate = 1
    midiState.getChannel(1).time = Date.now() - 1000

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 4,  // velocity
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // decay = min(1, 1000 * 1 * 0.001) = 1.0
    // value = 127 * (1 - 1) = 0
    assertApprox(result, 0, 0.05, 'should fully decay after 1000ms')
})

// ============================================================================
// Channel Selection
// ============================================================================

console.log('\n=== Channel Selection ===\n')

test('selects correct MIDI channel', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).noteOn(60, 50)
    midiState.getChannel(5).noteOn(72, 100)

    const config = {
        type: 'Midi',
        channel: 5,
        mode: 2,  // gateVelocity
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertApprox(result, 100 / 127, 0.01, 'should use channel 5 velocity')
})

// ============================================================================
// Min/Max Range Mapping
// ============================================================================

console.log('\n=== Range Mapping ===\n')

test('maps MIDI value to custom min/max range', () => {
    const { pipeline, midiState } = createTestPipeline()

    midiState.getChannel(1).key = 64  // ~50% of 127

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 0,  // noteChange
        min: 10,
        max: 20,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // 64/127 ≈ 0.504, so result ≈ 10 + 0.504 * 10 ≈ 15.04
    assertApprox(result, 15.04, 0.5, 'should map to custom range')
})

test('returns min when no MIDI state', () => {
    const pipeline = new Pipeline(null, null)
    // No MIDI state set

    const config = {
        type: 'Midi',
        channel: 1,
        mode: 4,
        min: 5,
        max: 10,
        sensitivity: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    assertEqual(result, 5, 'should return min when no MIDI state')
})

// ============================================================================
// Integration with non-MIDI values
// ============================================================================

console.log('\n=== Integration ===\n')

test('resolveUniformValue passes through non-MIDI values', () => {
    const { pipeline } = createTestPipeline()

    assertEqual(pipeline.resolveUniformValue(42, 0), 42, 'should pass through numbers')
    assertEqual(pipeline.resolveUniformValue('test', 0), 'test', 'should pass through strings')
    assertEqual(pipeline.resolveUniformValue(null, 0), null, 'should pass through null')
})

test('resolveUniformValue handles oscillator configs', () => {
    const { pipeline } = createTestPipeline()

    const oscConfig = {
        type: 'Oscillator',
        oscType: 0,  // sine
        min: 0,
        max: 1,
        speed: 1,
        offset: 0,
        seed: 1
    }

    const result = pipeline.resolveUniformValue(oscConfig, 0)
    assert(typeof result === 'number', 'should evaluate oscillator')
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
