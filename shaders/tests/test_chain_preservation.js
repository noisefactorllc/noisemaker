/**
 * Tests for read() chain behavior and _skip flag preservation.
 *
 * read() and read3d() are STARTER NODES - they MUST start a new chain.
 * Inline .read() syntax is a VALIDATION ERROR and will be rejected.
 *
 * These tests verify:
 * 1. Standalone read/read3d work correctly
 * 2. Inline .read()/.read3d() produce validation errors
 * 3. _skip flags are preserved through compile/unparse cycles
 */

import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { unparse } from '../src/lang/unparser.js'
import { ops } from '../src/lang/ops.js'

// Register test effects with the ops registry
ops['synth.noise'] = {
    globals: { freq: { name: 'freq', type: 'float', default: 10 } },
    starter: true,
    category: 'synth'
}
ops['filter.bloom'] = {
    globals: { radius: { name: 'radius', type: 'float', default: 1 } },
    category: 'filter'
}

// Register starter ops
registerStarterOps(['synth.noise'])

// Mock effect definitions for unparsing
function getEffectDef(name) {
    return ops[name] || null
}

function compile(source) {
    const tokens = lex(source)
    const ast = parse(tokens)
    return validate(ast)
}

function roundTrip(source) {
    const compiled = compile(source)
    return unparse(compiled, {}, { getEffectDef })
}

function test(name, fn) {
    try {
        console.log(`Running test: ${name}`)
        fn()
        console.log(`PASS: ${name}`)
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e.message)
        process.exitCode = 1
    }
}

// ============ Standalone read() Works Correctly ============

test('Standalone read() starts a new chain', () => {
    const source = `search synth

noise()
  .write(o1)

read(o1)
  .bloom()
  .write(o0)`
    const result = roundTrip(source)
    if (!result.includes('read(o1)')) {
        throw new Error(`Expected read(o1) in output. Got:\n${result}`)
    }
})

// ============ Inline .read() is a VALIDATION ERROR ============

test('Inline .read() produces validation error', () => {
    const source = `search synth

noise()
  .read(o1)
  .bloom()
  .write(o0)`
    const compiled = compile(source)
    // Should have diagnostics for inline read()
    if (!compiled.diagnostics || compiled.diagnostics.length === 0) {
        throw new Error('Expected validation error for inline .read(), but got none')
    }
    const hasReadError = compiled.diagnostics.some(d =>
        d.message && d.message.includes('read() is a starter node')
    )
    if (!hasReadError) {
        throw new Error(`Expected error about read() being a starter node. Got: ${JSON.stringify(compiled.diagnostics)}`)
    }
})

test('Inline .read3d() produces validation error', () => {
    const source = `search synth

noise()
  .read3d(vol0, geo0)
  .bloom()
  .write(o0)`
    const compiled = compile(source)
    // Should have diagnostics for inline read3d()
    if (!compiled.diagnostics || compiled.diagnostics.length === 0) {
        throw new Error('Expected validation error for inline .read3d(), but got none')
    }
    const hasRead3dError = compiled.diagnostics.some(d =>
        d.message && d.message.includes('read3d() is a starter node')
    )
    if (!hasRead3dError) {
        throw new Error(`Expected error about read3d() being a starter node. Got: ${JSON.stringify(compiled.diagnostics)}`)
    }
})

// ============ _skip Flag Preservation ============

test('_skip: true on read() is preserved in compiled output', () => {
    const source = `search synth

read(surface: o1, _skip: true)
  .bloom()
  .write(o0)`
    const compiled = compile(source)
    const readStep = compiled.plans[0].chain[0]
    if (readStep.op !== '_read') {
        throw new Error(`Expected first step to be _read, got ${readStep.op}`)
    }
    if (readStep.args._skip !== true) {
        throw new Error(`Expected _skip: true in args, got ${JSON.stringify(readStep.args)}`)
    }
})

test('_skip: true on read() round-trips correctly', () => {
    const source = `search synth

read(surface: o1, _skip: true)
  .bloom()
  .write(o0)`
    const result = roundTrip(source)
    if (!result.includes('_skip: true')) {
        throw new Error(`Expected _skip: true in output. Got:\n${result}`)
    }
    // Should use keyword form when _skip is present
    if (!result.includes('read(surface: o1, _skip: true)')) {
        throw new Error(`Expected keyword form with _skip. Got:\n${result}`)
    }
})

// ============ read3d Standalone Works ============

test('Standalone read3d() works correctly', () => {
    const source = `search synth

read3d(vol0, geo0)
  .bloom()
  .write(o0)`
    const result = roundTrip(source)
    if (!result.includes('read3d(vol0, geo0)')) {
        throw new Error(`Expected read3d(vol0, geo0) in output. Got:\n${result}`)
    }
})

test('_skip on read3d() is preserved', () => {
    const source = `search synth

read3d(tex3d: vol0, geo: geo0, _skip: true)
  .bloom()
  .write(o0)`
    const result = roundTrip(source)
    if (!result.includes('read3d(tex3d: vol0, geo: geo0, _skip: true)')) {
        throw new Error(`Expected read3d() with _skip: true. Got:\n${result}`)
    }
})

console.log('\nAll tests completed.')
