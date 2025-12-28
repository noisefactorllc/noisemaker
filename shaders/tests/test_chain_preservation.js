/**
 * Tests for chained read() preservation through parse -> validate -> unparse cycles.
 *
 * These tests verify that chained .read() syntax is preserved when round-tripping
 * through the compiler, and that _skip flags are preserved in compiled output.
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

// ============ Chain Structure Preservation Tests ============

test('Standalone read() starts a new chain', () => {
    const source = `search synth

noise()
  .write(o1)

read(o1)
  .bloom()
  .write(o0)`
    const result = roundTrip(source)
    // read(o1) should be on its own line, not chained
    if (result.includes('.read(')) {
        throw new Error(`Expected standalone read(), got chained .read(). Output:\n${result}`)
    }
    // Should use positional form when no _skip
    if (!result.includes('read(o1)')) {
        throw new Error(`Expected read(o1) in positional form. Got:\n${result}`)
    }
})

test('Chained .read() preserves chain structure', () => {
    const source = `search synth

noise()
  .read(o1)
  .bloom()
  .write(o0)`
    const result = roundTrip(source)
    // .read(o1) should remain chained (indented with .) and use positional form
    if (!result.includes('  .read(o1)')) {
        throw new Error(`Expected chained .read(o1) in positional form. Got:\n${result}`)
    }
})

test('Multiple chained reads preserve structure', () => {
    const source = `search synth

noise()
  .read(o1)
  .read(o2)
  .write(o0)`
    const result = roundTrip(source)
    // Both reads should be chained and use positional form
    const matches = result.match(/\.read\(o[12]\)/g)
    if (!matches || matches.length !== 2) {
        throw new Error(`Expected two chained .read() calls. Got:\n${result}`)
    }
})

// ============ Skip Flag Preservation Tests ============

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
})

test('_skip: true on chained .read() preserves chain and skip', () => {
    const source = `search synth

noise()
  .read(surface: o1, _skip: true)
  .bloom()
  .write(o0)`
    const result = roundTrip(source)
    // Should be chained AND have _skip
    if (!result.includes('  .read(surface: o1, _skip: true)')) {
        throw new Error(`Expected chained .read() with _skip: true. Got:\n${result}`)
    }
})

test('_skip on chained read is preserved in compiled step args', () => {
    const source = `search synth

noise()
  .read(surface: o1, _skip: true)
  .write(o0)`
    const compiled = compile(source)
    // First step is noise, second is _read
    const readStep = compiled.plans[0].chain[1]
    if (readStep.op !== '_read') {
        throw new Error(`Expected second step to be _read, got ${readStep.op}`)
    }
    if (readStep.args._skip !== true) {
        throw new Error(`Expected _skip: true in args, got ${JSON.stringify(readStep.args)}`)
    }
    if (!readStep.chained) {
        throw new Error('Expected chained: true on the step')
    }
})

// ============ read3d Tests ============

test('Chained .read3d() preserves chain structure', () => {
    const source = `search synth

noise()
  .read3d(vol0, geo0)
  .bloom()
  .write(o0)`
    const result = roundTrip(source)
    // Should use positional form when no _skip
    if (!result.includes('  .read3d(vol0, geo0)')) {
        throw new Error(`Expected chained .read3d() in positional form. Got:\n${result}`)
    }
})

test('_skip on chained .read3d() is preserved', () => {
    const source = `search synth

noise()
  .read3d(tex3d: vol0, geo: geo0, _skip: true)
  .write(o0)`
    const result = roundTrip(source)
    if (!result.includes('  .read3d(tex3d: vol0, geo: geo0, _skip: true)')) {
        throw new Error(`Expected chained .read3d() with _skip: true. Got:\n${result}`)
    }
})

console.log('\nAll tests completed.')
