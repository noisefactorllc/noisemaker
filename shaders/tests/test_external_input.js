/**
 * Tests for External Input State Classes (MIDI & Audio)
 *
 * Tests the MidiState, MidiChannelState, and AudioState classes
 * that provide real-time input state for midi() and audio() functions.
 */

import { MidiState, MidiChannelState, AudioState } from '../src/runtime/external-input.js'

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

function assertApprox(actual, expected, tolerance = 0.001, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message || 'Assertion failed'}: expected ~${expected}, got ${actual}`)
    }
}

// ============================================================================
// MidiChannelState Tests
// ============================================================================

console.log('\n=== MidiChannelState Tests ===\n')

test('MidiChannelState initializes with zeros', () => {
    const channel = new MidiChannelState()
    assertEqual(channel.key, 0, 'key should be 0')
    assertEqual(channel.velocity, 0, 'velocity should be 0')
    assertEqual(channel.gate, 0, 'gate should be 0')
    assertEqual(channel.time, 0, 'time should be 0')
})

test('MidiChannelState.noteOn sets all properties', () => {
    const channel = new MidiChannelState()
    const before = Date.now()
    channel.noteOn(60, 100)
    const after = Date.now()

    assertEqual(channel.key, 60, 'key should be 60')
    assertEqual(channel.velocity, 100, 'velocity should be 100')
    assertEqual(channel.gate, 1, 'gate should be 1')
    assert(channel.time >= before && channel.time <= after, 'time should be set to current time')
})

test('MidiChannelState.noteOff clears gate but preserves key/velocity', () => {
    const channel = new MidiChannelState()
    channel.noteOn(60, 100)
    channel.noteOff()

    assertEqual(channel.key, 60, 'key should remain 60')
    assertEqual(channel.velocity, 100, 'velocity should remain 100')
    assertEqual(channel.gate, 0, 'gate should be 0')
})

test('MidiChannelState.reset clears all properties', () => {
    const channel = new MidiChannelState()
    channel.noteOn(60, 100)
    channel.reset()

    assertEqual(channel.key, 0, 'key should be 0')
    assertEqual(channel.velocity, 0, 'velocity should be 0')
    assertEqual(channel.gate, 0, 'gate should be 0')
    assertEqual(channel.time, 0, 'time should be 0')
})

// ============================================================================
// MidiState Tests
// ============================================================================

console.log('\n=== MidiState Tests ===\n')

test('MidiState initializes 16 channels', () => {
    const midi = new MidiState()
    for (let i = 1; i <= 16; i++) {
        assert(midi.channels[i] instanceof MidiChannelState, `channel ${i} should exist`)
    }
})

test('MidiState.getChannel returns correct channel', () => {
    const midi = new MidiState()
    midi.channels[5].noteOn(64, 80)

    const ch5 = midi.getChannel(5)
    assertEqual(ch5.key, 64, 'should return channel 5')
    assertEqual(ch5.velocity, 80, 'should have correct velocity')
})

test('MidiState.getChannel falls back to channel 1 for invalid channels', () => {
    const midi = new MidiState()
    midi.channels[1].noteOn(60, 100)

    const invalid = midi.getChannel(99)
    assertEqual(invalid.key, 60, 'should fall back to channel 1')
})

test('MidiState.handleMessage processes note on', () => {
    const midi = new MidiState()
    // Note On, channel 1 (0x90), key 60, velocity 100
    midi.handleMessage(new Uint8Array([0x90, 60, 100]))

    const ch1 = midi.getChannel(1)
    assertEqual(ch1.key, 60, 'key should be 60')
    assertEqual(ch1.velocity, 100, 'velocity should be 100')
    assertEqual(ch1.gate, 1, 'gate should be 1')
})

test('MidiState.handleMessage processes note on for channel 5', () => {
    const midi = new MidiState()
    // Note On, channel 5 (0x94), key 72, velocity 64
    midi.handleMessage(new Uint8Array([0x94, 72, 64]))

    const ch5 = midi.getChannel(5)
    assertEqual(ch5.key, 72, 'key should be 72')
    assertEqual(ch5.velocity, 64, 'velocity should be 64')
    assertEqual(ch5.gate, 1, 'gate should be 1')
})

test('MidiState.handleMessage processes note off (0x80)', () => {
    const midi = new MidiState()
    midi.handleMessage(new Uint8Array([0x90, 60, 100]))  // Note on
    midi.handleMessage(new Uint8Array([0x80, 60, 0]))    // Note off

    const ch1 = midi.getChannel(1)
    assertEqual(ch1.gate, 0, 'gate should be 0')
    assertEqual(ch1.key, 60, 'key should remain')
})

test('MidiState.handleMessage processes note on with velocity 0 as note off', () => {
    const midi = new MidiState()
    midi.handleMessage(new Uint8Array([0x90, 60, 100]))  // Note on
    midi.handleMessage(new Uint8Array([0x90, 60, 0]))    // Note on with vel 0

    const ch1 = midi.getChannel(1)
    assertEqual(ch1.gate, 0, 'gate should be 0')
})

test('MidiState.reset clears all channels', () => {
    const midi = new MidiState()
    midi.handleMessage(new Uint8Array([0x90, 60, 100]))
    midi.handleMessage(new Uint8Array([0x95, 72, 80]))
    midi.reset()

    for (let i = 1; i <= 16; i++) {
        assertEqual(midi.channels[i].gate, 0, `channel ${i} gate should be 0`)
        assertEqual(midi.channels[i].key, 0, `channel ${i} key should be 0`)
    }
})

// ============================================================================
// AudioState Tests
// ============================================================================

console.log('\n=== AudioState Tests ===\n')

test('AudioState initializes with zeros', () => {
    const audio = new AudioState()
    assertEqual(audio.low, 0, 'low should be 0')
    assertEqual(audio.mid, 0, 'mid should be 0')
    assertEqual(audio.high, 0, 'high should be 0')
    assertEqual(audio.vol, 0, 'vol should be 0')
    assertEqual(audio.fft.length, 16, 'fft should have 16 bins')
})

test('AudioState.setBands sets frequency bands directly', () => {
    const audio = new AudioState()
    audio.setBands(0.5, 0.3, 0.8)

    assertEqual(audio.low, 0.5, 'low should be 0.5')
    assertEqual(audio.mid, 0.3, 'mid should be 0.3')
    assertEqual(audio.high, 0.8, 'high should be 0.8')
    assertApprox(audio.vol, (0.5 + 0.3 + 0.8) / 3, 0.001, 'vol should be average')
})

test('AudioState.setBands clamps values to 0-1', () => {
    const audio = new AudioState()
    audio.setBands(-0.5, 1.5, 0.5)

    assertEqual(audio.low, 0, 'low should be clamped to 0')
    assertEqual(audio.mid, 1, 'mid should be clamped to 1')
    assertEqual(audio.high, 0.5, 'high should remain 0.5')
})

test('AudioState.reset clears all values', () => {
    const audio = new AudioState()
    audio.setBands(0.5, 0.5, 0.5)
    audio.reset()

    assertEqual(audio.low, 0, 'low should be 0')
    assertEqual(audio.mid, 0, 'mid should be 0')
    assertEqual(audio.high, 0, 'high should be 0')
    assertEqual(audio.vol, 0, 'vol should be 0')
})

test('AudioState smoothing accumulates over multiple updates', () => {
    const audio = new AudioState()

    // Set smoothing to 3 frames
    audio._maxBufferLength = 3

    // First update - buffer has 1 value
    audio.setBands(0.9, 0.9, 0.9)
    audio._smoothingBuffers.low = [0.9]
    audio._smoothingBuffers.mid = [0.9]
    audio._smoothingBuffers.high = [0.9]

    // Simulate smoothing behavior
    const result = audio._smooth('low', 0.3)
    // Buffer now [0.9, 0.3], average = 0.6
    assertApprox(result, 0.6, 0.001, 'smoothed value should be average')
})

// ============================================================================
// AudioState Waveform Tests
// ============================================================================

console.log('\n=== AudioState Waveform Tests ===\n')

test('AudioState initializes waveform as 128-element Float32Array', () => {
    const audio = new AudioState()
    assert(audio.waveform instanceof Float32Array, 'waveform should be Float32Array')
    assertEqual(audio.waveform.length, 128, 'waveform should have 128 elements')
    assertApprox(audio.waveform[0], 0.5, 0.01, 'waveform should default to 0.5 (silence)')
})

test('AudioState.setWaveform populates waveform from Uint8Array', () => {
    const audio = new AudioState()
    const raw = new Uint8Array(128)
    for (let i = 0; i < 64; i++) raw[i] = 255
    for (let i = 64; i < 128; i++) raw[i] = 0
    audio.setWaveform(raw)
    assertApprox(audio.waveform[0], 1.0, 0.01, 'first sample should be 1.0')
    assertApprox(audio.waveform[63], 1.0, 0.01, 'sample 63 should be 1.0')
    assertApprox(audio.waveform[64], 0.0, 0.01, 'sample 64 should be 0.0')
    assertApprox(audio.waveform[127], 0.0, 0.01, 'last sample should be 0.0')
})

test('AudioState.reset clears waveform to silence', () => {
    const audio = new AudioState()
    const raw = new Uint8Array(128)
    raw.fill(255)
    audio.setWaveform(raw)
    audio.reset()
    assertApprox(audio.waveform[0], 0.5, 0.01, 'waveform should reset to 0.5')
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
