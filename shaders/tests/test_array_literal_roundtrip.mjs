/**
 * End-to-end round-trip for the array-literal DSL feature using LOCAL
 * src/lang/ code (independent of the CDN bundle). Exercises the full
 * lex → parse → validate → unparse → re-parse → re-validate cycle that
 * a host app would drive when serializing programState back to DSL and
 * recompiling it (the use case behind noisedeck/remapUI).
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

// Register an op with vec2/vec3/vec4 globals so we can drive the
// validator end-to-end.
registerOp('synth.vecop', {
    name: 'vecop',
    args: [
        { name: 'pos2', type: 'vec2', default: [0, 0] },
        { name: 'pos3', type: 'vec3', default: [0, 0, 0] },
        { name: 'pos4', type: 'vec4', default: [0, 0, 0, 1] }
    ]
})
registerStarterOps(['synth.vecop'])

const getEffectDef = (name) => {
    if (name === 'synth.vecop' || name === 'vecop') {
        return {
            globals: {
                pos2: { type: 'vec2', default: [0, 0] },
                pos3: { type: 'vec3', default: [0, 0, 0] },
                pos4: { type: 'vec4', default: [0, 0, 0, 1] }
            }
        }
    }
    return null
}

function compile(dsl) {
    const tokens = lex(dsl)
    const ast = parse(tokens)
    const result = validate(ast)
    return result
}

test('Array literal lexes, parses, and validates', () => {
    const result = compile('search synth\nvecop(pos4: [0.05, 0.5, 0.95, 1.0]).write(o0)')
    if (result.diagnostics.length > 0) {
        throw new Error(`Unexpected diagnostics: ${JSON.stringify(result.diagnostics)}`)
    }
    const args = result.plans[0].chain[0].args
    assertEqualArr(args.pos4, [0.05, 0.5, 0.95, 1.0], 'pos4 should be [0.05, 0.5, 0.95, 1.0]')
})

test('Round-trip: parse → unparse → reparse produces identical args', () => {
    const dsl = 'search synth\nvecop(pos2: [0.1, 0.9], pos4: [0.05, 0.5, 0.95, 1.0]).write(o0)'
    const first = compile(dsl)
    if (first.diagnostics.length > 0) throw new Error('first parse had diagnostics')
    const reEmitted = unparse(first, {}, { getEffectDef })
    if (!reEmitted.includes('[0.1, 0.9]')) throw new Error('unparser dropped pos2 array literal: ' + reEmitted)
    if (!reEmitted.includes('[0.05, 0.5, 0.95, 1]')) throw new Error('unparser dropped pos4 array literal: ' + reEmitted)
    const second = compile(reEmitted)
    if (second.diagnostics.length > 0) throw new Error('reparse had diagnostics: ' + JSON.stringify(second.diagnostics))
    const args = second.plans[0].chain[0].args
    assertEqualArr(args.pos2, [0.1, 0.9], 'pos2 round-tripped')
    assertEqualArr(args.pos4, [0.05, 0.5, 0.95, 1.0], 'pos4 round-tripped')
})

test('Backward compat: vec4(...) constructor still parses + validates', () => {
    const result = compile('search synth\nvecop(pos4: vec4(1, 2, 3, 4)).write(o0)')
    if (result.diagnostics.length > 0) throw new Error(`Diagnostics: ${JSON.stringify(result.diagnostics)}`)
    const args = result.plans[0].chain[0].args
    assertEqualArr(args.pos4, [1, 2, 3, 4], 'vec4() constructor still works')
})

test('Wrong-arity array literal errors with S002', () => {
    const result = compile('search synth\nvecop(pos4: [1, 2, 3]).write(o0)')
    const diag = result.diagnostics.find(d => d.code === 'S002')
    if (!diag) throw new Error(`Expected S002, got ${JSON.stringify(result.diagnostics)}`)
})

test('Unparser preserves array-literal form for vec params after recompile', () => {
    // A host app's setValue(stepKey, 'pos4', [...]) followed by unparse +
    // recompile is the noisedeck/remapUI flow. Simulate it: build a
    // programState-shaped result and unparse it.
    const compiled = {
        searchNamespaces: ['synth'],
        plans: [{
            chain: [{ op: 'synth.vecop', args: { pos4: [0.5, 0.5, 0.5, 0.5] } }],
            write: { kind: 'output', name: 'o0' }
        }]
    }
    const dsl = unparse(compiled, {}, { getEffectDef })
    if (!dsl.includes('[0.5, 0.5, 0.5, 0.5]')) {
        throw new Error('unparser did not emit array literal: ' + dsl)
    }
    // Re-parsing the emitted DSL should restore the same args.
    const reparsed = compile(dsl)
    if (reparsed.diagnostics.length > 0) throw new Error('reparse had diagnostics: ' + JSON.stringify(reparsed.diagnostics))
    assertEqualArr(reparsed.plans[0].chain[0].args.pos4, [0.5, 0.5, 0.5, 0.5], 'reparsed pos4 matches original')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
