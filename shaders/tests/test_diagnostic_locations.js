import assert from 'node:assert/strict'
import test from 'node:test'
import { compile, lex, parse, validate } from '../src/lang/index.js'
import { registerOp } from '../src/lang/ops.js'
import { registerStarterOps } from '../src/lang/validator.js'

registerOp('synth.diagProbe', { name: 'diagProbe', args: [] })
registerStarterOps(['synth.diagProbe'])

test('compile preserves exact read and write diagnostic columns through JSON', () => {
    const result = compile('search synth\n  read(123).write(o0)')
    assert.deepEqual(result.diagnostics.map(({ code, location }) => ({ code, location })), [
        { code: 'S001', location: { line: 2, column: 3 } },
        { code: 'S005', location: { line: 2, column: 13 } }
    ])
    assert.deepEqual(JSON.parse(JSON.stringify(result)).diagnostics.map(d => d.location), [
        { line: 2, column: 3 },
        { line: 2, column: 13 }
    ])
})

test('compile locates an inline read after blank lines and indentation', () => {
    const result = compile('search synth\n\n    diagProbe().read(o0).write(o1)')
    assert.equal(result.diagnostics.length, 1)
    assert.deepEqual(result.diagnostics[0], {
        code: 'S001',
        message: "read() is a starter node and cannot be chained inline. Use standalone read() to start a new chain.: '[Read]'",
        severity: 'error',
        nodeId: undefined,
        location: { line: 3, column: 17 },
        identifier: '[Read]'
    })
})

test('validate preserves an explicit column on caller-supplied AST locations', () => {
    const ast = parse(lex('search synth\n  read(123).write(o0)'))
    ast.plans[0].chain[0].loc.column = 9
    const result = validate(ast)
    assert.deepEqual(result.diagnostics[0].location, { line: 2, column: 9 })
})

test('compile does not invent a location for an unlocated AST node', () => {
    const result = compile('search synth\n  missing().write(o0)')
    const diagnostic = result.diagnostics.find(d => d.identifier === 'missing')
    assert.equal(diagnostic.code, 'S001')
    assert.equal(Object.hasOwn(diagnostic, 'location'), false)
})

test('valid source retains its compiled effect and builtin indexes', () => {
    const result = compile('search synth\n  diagProbe().write(o0)')
    assert.deepEqual(result.diagnostics, [])
    assert.deepEqual(result.plans[0].chain, [
        { op: 'synth.diagProbe', args: {}, from: null, temp: 0 },
        { op: '_write', args: { tex: { kind: 'output', name: 'o0' } }, from: 0, temp: 1, builtin: true }
    ])
    assert.deepEqual(Object.keys(result).sort(), ['diagnostics', 'plans', 'render', 'searchNamespaces', 'vars'])
})
