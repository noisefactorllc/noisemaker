/**
 * Round-trip: a program containing `[…]` parses, validates, unparses
 * back to text containing `[…]`, and re-parses to the same compiled
 * args. The vecN(...) constructor and all other input forms are
 * unchanged — verified by re-running their existing tests, plus the
 * "no existing program contains [" verification in
 * test_array_literal_additive.mjs.
 */

import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { registerOp } from '../src/lang/ops.js'
import { unparse } from '../src/lang/unparser.js'

let passed = 0
let failed = 0

function test(name, fn) {
    try {
        fn()
        console.log(`✓ ${name}`)
        passed++
    } catch (err) {
        console.error(`✗ ${name}`)
        console.error(`  ${err.message}`)
        failed++
    }
}

function assertEqualArr(actual, expected, message) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
        throw new Error(`${message}\n  expected length ${expected.length}, got ${JSON.stringify(actual)}`)
    }
    for (let i = 0; i < expected.length; i++) {
        if (actual[i] !== expected[i]) {
            throw new Error(`${message}\n  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
        }
    }
}

// Register an op with vec3/vec4 globals — same shape the existing
// validator dispatch knows about.
registerOp('synth.vecop', {
    name: 'vecop',
    args: [
        { name: 'pos3', type: 'vec3', default: [0, 0, 0] },
        { name: 'pos4', type: 'vec4', default: [0, 0, 0, 1] }
    ]
})
registerStarterOps(['synth.vecop'])

const getEffectDef = (name) => {
    if (name === 'synth.vecop' || name === 'vecop') {
        return {
            globals: {
                pos3: { type: 'vec3', default: [0, 0, 0] },
                pos4: { type: 'vec4', default: [0, 0, 0, 1] }
            }
        }
    }
    return null
}

function compile(dsl) {
    return validate(parse(lex(dsl)))
}

test('Array literal lexes, parses, and validates', () => {
    const result = compile('search synth\nvecop(pos4: [0.05, 0.5, 0.95, 1.0]).write(o0)')
    if (result.diagnostics.length > 0) {
        throw new Error(`Unexpected diagnostics: ${JSON.stringify(result.diagnostics)}`)
    }
    const args = result.plans[0].chain[0].args
    assertEqualArr(args.pos4, [0.05, 0.5, 0.95, 1.0], 'pos4 values')
})

test('Array literal source form is recorded in compiled output', () => {
    const result = compile('search synth\nvecop(pos3: [0.1, 0.2, 0.3]).write(o0)')
    const step = result.plans[0].chain[0]
    if (!step.argSources) throw new Error('argSources missing')
    if (step.argSources.pos3 !== 'array') throw new Error('Expected pos3 source form "array", got: ' + JSON.stringify(step.argSources))
})

test('Round-trip: parse → unparse → reparse preserves values AND form', () => {
    const original = 'search synth\nvecop(pos3: [0.1, 0.2, 0.3], pos4: [0.05, 0.5, 0.95, 1]).write(o0)'
    const first = compile(original)
    if (first.diagnostics.length > 0) throw new Error('First parse had diagnostics')
    const reEmitted = unparse(first, {}, { getEffectDef })
    if (!reEmitted.includes('[0.1, 0.2, 0.3]')) {
        throw new Error('Unparser did not emit [...] for array-literal-sourced pos3:\n  ' + reEmitted)
    }
    if (!reEmitted.includes('[0.05, 0.5, 0.95, 1]')) {
        throw new Error('Unparser did not emit [...] for array-literal-sourced pos4:\n  ' + reEmitted)
    }
    // Reparse the emitted DSL; values must match.
    const second = compile(reEmitted)
    if (second.diagnostics.length > 0) throw new Error('Reparse had diagnostics: ' + JSON.stringify(second.diagnostics))
    assertEqualArr(second.plans[0].chain[0].args.pos3, [0.1, 0.2, 0.3], 'pos3 round-tripped')
    assertEqualArr(second.plans[0].chain[0].args.pos4, [0.05, 0.5, 0.95, 1], 'pos4 round-tripped')
})

test('Existing vec3() programs round-trip through the SAME path as before', () => {
    // No `[` in source → no ArrayLiteral → no argSources → unparser
    // falls through to its existing vec3()-emitting path. Identical to
    // pre-change behavior.
    const original = 'search synth\nvecop(pos3: vec3(0.1, 0.2, 0.3)).write(o0)'
    const first = compile(original)
    const step = first.plans[0].chain[0]
    if (step.argSources) throw new Error('argSources should be absent for vecN(...) input, got: ' + JSON.stringify(step.argSources))
    const reEmitted = unparse(first, {}, { getEffectDef })
    if (!reEmitted.includes('vec3(')) {
        throw new Error('vec3() programs should still round-trip as vec3(): ' + reEmitted)
    }
    if (reEmitted.includes('[0.1')) {
        throw new Error('vec3()-sourced value must NOT come back as array literal: ' + reEmitted)
    }
})

test('Length passes through unchanged — no arity gate', () => {
    const result = compile('search synth\nvecop(pos3: [1, 2]).write(o0)')
    const args = result.plans[0].chain[0].args
    if (args.pos3.length !== 2 || args.pos3[0] !== 1 || args.pos3[1] !== 2) {
        throw new Error('Expected [1, 2] passthrough, got: ' + JSON.stringify(args.pos3))
    }
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
