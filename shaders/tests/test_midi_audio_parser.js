/**
 * Tests for midi() and audio() Parser Integration
 *
 * Tests parsing, validation, and unparsing of midi() and audio() functions.
 */

import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { registerStarterOps } from '../src/lang/validator.js'
import { compile } from '../src/lang/index.js'
import { formatValue } from '../src/lang/unparser.js'
import { registerOp } from '../src/lang/ops.js'

// Register test ops
registerOp('synth.noise', {
    name: 'noise',
    args: [
        { name: 'scale', type: 'float', default: 10 }
    ]
})

registerStarterOps(['synth.noise'])

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
        if (e.stack) console.error(e.stack.split('\n').slice(1, 3).join('\n'))
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

// ============================================================================
// midi() Parsing Tests
// ============================================================================

console.log('\n=== midi() Parsing ===\n')

test('parses midi with channel only', () => {
    const tokens = lex('search synth\nnoise(scale: midi(channel: 1)).write(o0)')
    const ast = parse(tokens)

    // Find the midi node in the AST
    const chain = ast.plans[0].chain
    const noiseCall = chain[0]
    const scaleArg = noiseCall.kwargs.scale

    assertEqual(scaleArg.type, 'Midi', 'should create Midi node')
    assertEqual(scaleArg.channel.value, 1, 'channel should be 1')
    // Default mode should be midiMode.velocity
    assertEqual(scaleArg.mode.type, 'Member', 'mode should be Member node')
    assertEqual(scaleArg.mode.path[1], 'velocity', 'default mode should be velocity')
})

test('parses midi with all parameters', () => {
    const tokens = lex('search synth\nnoise(scale: midi(channel: 5, mode: midiMode.gateNote, min: 2, max: 20, sensitivity: 3)).write(o0)')
    const ast = parse(tokens)

    const chain = ast.plans[0].chain
    const noiseCall = chain[0]
    const scaleArg = noiseCall.kwargs.scale

    assertEqual(scaleArg.type, 'Midi', 'should create Midi node')
    assertEqual(scaleArg.channel.value, 5, 'channel should be 5')
    assertEqual(scaleArg.mode.path[1], 'gateNote', 'mode should be gateNote')
    assertEqual(scaleArg.min.value, 2, 'min should be 2')
    assertEqual(scaleArg.max.value, 20, 'max should be 20')
    assertEqual(scaleArg.sensitivity.value, 3, 'sensitivity should be 3')
})

test('parses midi with positional arguments', () => {
    const tokens = lex('search synth\nnoise(scale: midi(1, midiMode.velocity, 0, 10)).write(o0)')
    const ast = parse(tokens)

    const chain = ast.plans[0].chain
    const noiseCall = chain[0]
    const scaleArg = noiseCall.kwargs.scale

    assertEqual(scaleArg.type, 'Midi', 'should create Midi node')
    assertEqual(scaleArg.channel.value, 1, 'channel should be 1')
    assertEqual(scaleArg.max.value, 10, 'max should be 10')
})

test('midi throws on missing channel', () => {
    const tokens = lex('search synth\nnoise(scale: midi()).write(o0)')
    let threw = false
    try {
        parse(tokens)
    } catch (e) {
        threw = true
        assert(e.message.includes('channel'), 'should mention channel')
    }
    assert(threw, 'should throw on missing channel')
})

// ============================================================================
// audio() Parsing Tests
// ============================================================================

console.log('\n=== audio() Parsing ===\n')

test('parses audio with band only', () => {
    const tokens = lex('search synth\nnoise(scale: audio(band: audioBand.low)).write(o0)')
    const ast = parse(tokens)

    const chain = ast.plans[0].chain
    const noiseCall = chain[0]
    const scaleArg = noiseCall.kwargs.scale

    assertEqual(scaleArg.type, 'Audio', 'should create Audio node')
    assertEqual(scaleArg.band.path[1], 'low', 'band should be low')
    assertEqual(scaleArg.min.value, 0, 'default min should be 0')
    assertEqual(scaleArg.max.value, 1, 'default max should be 1')
})

test('parses audio with all parameters', () => {
    const tokens = lex('search synth\nnoise(scale: audio(band: audioBand.mid, min: 1, max: 100)).write(o0)')
    const ast = parse(tokens)

    const chain = ast.plans[0].chain
    const noiseCall = chain[0]
    const scaleArg = noiseCall.kwargs.scale

    assertEqual(scaleArg.type, 'Audio', 'should create Audio node')
    assertEqual(scaleArg.band.path[1], 'mid', 'band should be mid')
    assertEqual(scaleArg.min.value, 1, 'min should be 1')
    assertEqual(scaleArg.max.value, 100, 'max should be 100')
})

test('parses audio with positional arguments', () => {
    const tokens = lex('search synth\nnoise(scale: audio(audioBand.high, 0, 50)).write(o0)')
    const ast = parse(tokens)

    const chain = ast.plans[0].chain
    const noiseCall = chain[0]
    const scaleArg = noiseCall.kwargs.scale

    assertEqual(scaleArg.type, 'Audio', 'should create Audio node')
    assertEqual(scaleArg.band.path[1], 'high', 'band should be high')
    assertEqual(scaleArg.max.value, 50, 'max should be 50')
})

test('audio throws on missing band', () => {
    const tokens = lex('search synth\nnoise(scale: audio()).write(o0)')
    let threw = false
    try {
        parse(tokens)
    } catch (e) {
        threw = true
        assert(e.message.includes('band'), 'should mention band')
    }
    assert(threw, 'should throw on missing band')
})

// ============================================================================
// Validation Tests
// ============================================================================

console.log('\n=== Validation ===\n')

test('validates midi() and creates runtime config', () => {
    const result = compile('search synth\nnoise(scale: midi(channel: 1)).write(o0)')

    // Find the compiled step
    const step = result.plans[0].chain[0]
    assert(step.args, 'should have args')

    const scaleArg = step.args.scale
    assert(scaleArg, 'should have scale arg')
    assertEqual(scaleArg.midi, true, 'should have midi flag')
    assertEqual(scaleArg.channel, 1, 'should have channel')
    assertEqual(scaleArg.mode, 4, 'should have velocity mode (4)')
})

test('validates audio() and creates runtime config', () => {
    const result = compile('search synth\nnoise(scale: audio(band: audioBand.low)).write(o0)')

    const step = result.plans[0].chain[0]
    assert(step.args, 'should have args')

    const scaleArg = step.args.scale
    assert(scaleArg, 'should have scale arg')
    assertEqual(scaleArg.audio, true, 'should have audio flag')
    assertEqual(scaleArg.band, 0, 'should have low band (0)')
})

test('validates midi mode enum values', () => {
    const modes = ['noteChange', 'gateNote', 'gateVelocity', 'triggerNote', 'velocity']

    modes.forEach((mode, index) => {
        const result = compile(`search synth\nnoise(scale: midi(channel: 1, mode: midiMode.${mode})).write(o0)`)
        const scaleArg = result.plans[0].chain[0].args.scale
        assertEqual(scaleArg.mode, index, `mode ${mode} should resolve to ${index}`)
    })
})

test('validates audio band enum values', () => {
    const bands = ['low', 'mid', 'high', 'vol']

    bands.forEach((band, index) => {
        const result = compile(`search synth\nnoise(scale: audio(band: audioBand.${band})).write(o0)`)
        const scaleArg = result.plans[0].chain[0].args.scale
        assertEqual(scaleArg.band, index, `band ${band} should resolve to ${index}`)
    })
})

// ============================================================================
// Unparser Tests
// ============================================================================

console.log('\n=== Unparser ===\n')

test('formats midi runtime config', () => {
    const config = {
        midi: true,
        channel: 1,
        mode: 4,  // velocity
        min: 0,
        max: 1,
        sensitivity: 1
    }

    const result = formatValue(config)
    assertEqual(result, 'midi(channel: 1)', 'should format with defaults omitted')
})

test('formats midi with non-default values', () => {
    const config = {
        midi: true,
        channel: 5,
        mode: 1,  // gateNote
        min: 2,
        max: 10,
        sensitivity: 3
    }

    const result = formatValue(config)
    assert(result.includes('channel: 5'), 'should include channel')
    assert(result.includes('mode: midiMode.gateNote'), 'should include mode')
    assert(result.includes('min: 2'), 'should include min')
    assert(result.includes('max: 10'), 'should include max')
    assert(result.includes('sensitivity: 3'), 'should include sensitivity')
})

test('formats audio runtime config', () => {
    const config = {
        audio: true,
        band: 0,  // low
        min: 0,
        max: 1
    }

    const result = formatValue(config)
    assertEqual(result, 'audio(band: audioBand.low)', 'should format with defaults omitted')
})

test('formats audio with non-default values', () => {
    const config = {
        audio: true,
        band: 2,  // high
        min: 5,
        max: 100
    }

    const result = formatValue(config)
    assert(result.includes('band: audioBand.high'), 'should include band')
    assert(result.includes('min: 5'), 'should include min')
    assert(result.includes('max: 100'), 'should include max')
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
