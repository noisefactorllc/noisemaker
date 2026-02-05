/**
 * Tests for shaders/src/lang/paramAliases.js
 *
 * Run:  node shaders/tests/test_param_aliases.js
 */

import {
    ALIAS_EOL_DATE,
    registerParamAliases,
    resolveParamAliases
} from '../src/lang/paramAliases.js'

let passed = 0
let failed = 0

function test(name, fn) {
    try {
        fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e)
        failed++
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed')
}

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

// ---------------------------------------------------------------------------
// Setup: register aliases for a test op
// ---------------------------------------------------------------------------
registerParamAliases('synth.noise', {
    freq: 'frequency',
    amt: 'amount'
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('ALIAS_EOL_DATE is 2026-09-01', () => {
    assertEqual(ALIAS_EOL_DATE, '2026-09-01', 'ALIAS_EOL_DATE')
})

test('Basic alias resolution: old key remapped to new key', () => {
    const kwargs = { freq: 42 }
    const warnings = resolveParamAliases('synth.noise', kwargs)

    assertEqual(kwargs.frequency, 42, 'new key should have the old value')
    assert(!('freq' in kwargs), 'old key should be deleted')
    assertEqual(warnings.length, 1, 'should produce one warning')
    assert(warnings[0].includes("'freq'"), 'warning should mention old name')
    assert(warnings[0].includes("'frequency'"), 'warning should mention new name')
    assert(warnings[0].includes('2026-09-01'), 'warning should include EOL date')
})

test('New name takes priority when both old and new are present', () => {
    const kwargs = { freq: 10, frequency: 99 }
    const warnings = resolveParamAliases('synth.noise', kwargs)

    assertEqual(kwargs.frequency, 99, 'new key value should be preserved')
    assert(!('freq' in kwargs), 'old key should still be deleted')
    assertEqual(warnings.length, 1, 'should still produce a warning')
})

test('Multiple aliases resolved in one call', () => {
    const kwargs = { freq: 1, amt: 2, other: 3 }
    const warnings = resolveParamAliases('synth.noise', kwargs)

    assertEqual(kwargs.frequency, 1, 'freq -> frequency')
    assertEqual(kwargs.amount, 2, 'amt -> amount')
    assertEqual(kwargs.other, 3, 'non-aliased key untouched')
    assert(!('freq' in kwargs), 'old key freq deleted')
    assert(!('amt' in kwargs), 'old key amt deleted')
    assertEqual(warnings.length, 2, 'two warnings expected')
})

test('No warnings for unknown op', () => {
    const kwargs = { freq: 5 }
    const warnings = resolveParamAliases('unknown.op', kwargs)

    assertEqual(warnings.length, 0, 'no warnings for unknown op')
    assertEqual(kwargs.freq, 5, 'kwargs unchanged')
})

test('No warnings when no aliases match', () => {
    const kwargs = { unrelated: 7 }
    const warnings = resolveParamAliases('synth.noise', kwargs)

    assertEqual(warnings.length, 0, 'no warnings when no aliases match')
    assertEqual(kwargs.unrelated, 7, 'kwargs unchanged')
})

test('registerParamAliases merges with existing aliases', () => {
    // 'synth.noise' already has freq->frequency and amt->amount
    registerParamAliases('synth.noise', {
        spd: 'speed'
    })

    // Old aliases should still work
    const kwargs1 = { freq: 1 }
    const w1 = resolveParamAliases('synth.noise', kwargs1)
    assertEqual(kwargs1.frequency, 1, 'original alias still works after merge')
    assertEqual(w1.length, 1, 'original alias still warns')

    // New alias should also work
    const kwargs2 = { spd: 5 }
    const w2 = resolveParamAliases('synth.noise', kwargs2)
    assertEqual(kwargs2.speed, 5, 'newly merged alias works')
    assertEqual(w2.length, 1, 'newly merged alias warns')
})

test('registerParamAliases can override an existing alias mapping', () => {
    registerParamAliases('synth.noise', {
        spd: 'velocity'   // override spd -> speed  to  spd -> velocity
    })

    const kwargs = { spd: 3 }
    const warnings = resolveParamAliases('synth.noise', kwargs)
    assertEqual(kwargs.velocity, 3, 'override alias maps to new target')
    assert(!('speed' in kwargs), 'old target not set')
    assertEqual(warnings.length, 1, 'one warning produced')
    assert(warnings[0].includes("'velocity'"), 'warning mentions updated target')
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
