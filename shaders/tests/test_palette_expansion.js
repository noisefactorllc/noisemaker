/**
 * Tests for shaders/src/runtime/palette-expansion.js
 *
 * Run:  node shaders/tests/test_palette_expansion.js
 */

import { expandPalette } from '../src/runtime/palette-expansion.js'

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

async function runTests() {
    console.log('\n=== Running Palette Expansion Tests ===\n')
    for (const { name, fn } of tests) {
        try {
            await fn()
            console.log(`PASS: ${name}`)
        } catch (e) {
            console.error(`FAIL: ${name}`)
            console.error(e)
            process.exit(1)
        }
    }
    console.log(`\nAll ${tests.length} tests passed\n`)
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed')
}

function assertClose(a, b, msg, tol = 0.0001) {
    if (Math.abs(a - b) > tol) throw new Error(`${msg}: expected ${b}, got ${a}`)
}

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

function assertArrayClose(actual, expected, label, tol = 0.0001) {
    assertEqual(actual.length, expected.length, `${label} length`)
    for (let i = 0; i < expected.length; i++) {
        assertClose(actual[i], expected[i], `${label}[${i}]`, tol)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('returns null for index 0', () => {
    const result = expandPalette(0)
    assertEqual(result, null, 'expandPalette(0)')
})

test('returns null for negative index', () => {
    const result = expandPalette(-1)
    assertEqual(result, null, 'expandPalette(-1)')
})

test('returns null for out-of-range index', () => {
    const result = expandPalette(999)
    assertEqual(result, null, 'expandPalette(999)')
})

test('index 3 (afterimage) returns correct rgb data', () => {
    const result = expandPalette(3)
    assert(result !== null, 'result should not be null')
    assertArrayClose(result.paletteAmp, [0.5, 0.5, 0.5], 'amp')
    assertArrayClose(result.paletteOffset, [0.5, 0.5, 0.5], 'offset')
    assertArrayClose(result.palettePhase, [0.3, 0.2, 0.2], 'phase')
    assertEqual(result.paletteMode, 3, 'paletteMode')
})

test('index 12 (darkSatin) returns hsv mode', () => {
    const result = expandPalette(12)
    assert(result !== null, 'result should not be null')
    assertEqual(result.paletteMode, 1, 'paletteMode should be 1 (hsv)')
})

test('index 40 (silvermane) returns oklab mode', () => {
    const result = expandPalette(40)
    assert(result !== null, 'result should not be null')
    assertEqual(result.paletteMode, 2, 'paletteMode should be 2 (oklab)')
    assertArrayClose(result.paletteAmp, [0.42, 0.0, 0.0], 'amp')
    assertArrayClose(result.paletteFreq, [2.0, 2.0, 2.0], 'freq')
})

test('index 55 (vintagePhoto, last entry) works', () => {
    const result = expandPalette(55)
    assert(result !== null, 'result should not be null')
    assertClose(result.paletteAmp[0], 0.68, 'amp[0]')
})

test('returned arrays are copies', () => {
    const a = expandPalette(3)
    const b = expandPalette(3)
    // Mutate result A
    a.paletteAmp[0] = 999.0
    a.paletteOffset[1] = 888.0
    a.paletteFreq[2] = 777.0
    a.palettePhase[0] = 666.0
    // Result B should be unaffected
    assertClose(b.paletteAmp[0], 0.5, 'paletteAmp[0] should be unaffected')
    assertClose(b.paletteOffset[1], 0.5, 'paletteOffset[1] should be unaffected')
    assertClose(b.paletteFreq[2], 1.0, 'paletteFreq[2] should be unaffected')
    assertClose(b.palettePhase[0], 0.3, 'palettePhase[0] should be unaffected')
})

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
runTests()
