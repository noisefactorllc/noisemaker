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

const lexerFailures = [
    {
        name: 'unexpected character after CRLF, tab, and UTF-16 text',
        source: '// 😀\r\n\t@', code: 'L001',
        message: "Unexpected character '@' at line 2 col 2",
        location: { line: 2, column: 2 }, span: { start: 8, end: 9 }
    },
    {
        name: 'unterminated double-quoted string at EOF',
        source: '"abc', code: 'L002',
        message: 'Unterminated string literal at line 1 col 1',
        location: { line: 1, column: 1 }, span: { start: 0, end: 4 }
    },
    {
        name: 'unterminated single-quoted string at LF',
        source: " 'abc\nnext", code: 'L002',
        message: 'Unterminated string literal at line 1 col 2',
        location: { line: 1, column: 2 }, span: { start: 1, end: 5 }
    },
    {
        name: 'unterminated triple-quoted string across lines',
        source: '\n  """a\nb', code: 'L002',
        message: 'Unterminated triple-quoted string at line 2 col 3',
        location: { line: 2, column: 3 }, span: { start: 3, end: 9 }
    },
    {
        name: 'unterminated block comment across lines',
        source: '\n /* a\nb', code: 'L003',
        message: 'Unterminated comment at line 2 col 2',
        location: { line: 2, column: 2 }, span: { start: 2, end: 8 }
    },
    {
        name: 'out-of-range output reference',
        source: 'search synth\nrender(o99)', code: 'L004',
        message: "Output surface reference 'o99' is out of range; expected o0-o7 at line 2 col 8",
        location: { line: 2, column: 8 }, span: { start: 20, end: 23 }
    },
    {
        name: 'UTF-16 columns after a string',
        source: '"😀" @', code: 'L001',
        message: "Unexpected character '@' at line 1 col 6",
        location: { line: 1, column: 6 }, span: { start: 5, end: 6 }
    },
    {
        name: 'source coordinates after a multiline function token',
        source: '() => (1\n + 2), @', code: 'L001',
        message: "Unexpected character '@' at line 1 col 17",
        location: { line: 2, column: 8 }, span: { start: 16, end: 17 }
    },
    {
        name: 'source coordinates after an escaped LF in a string',
        source: '"a\\\nb" @', code: 'L001',
        message: "Unexpected character '@' at line 1 col 8",
        location: { line: 2, column: 4 }, span: { start: 7, end: 8 }
    }
]

for (const { name, source, code, message, location, span } of lexerFailures) {
    test(`lexer diagnostic: ${name}`, () => {
        for (const entryPoint of [lex, compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.name, 'SyntaxError')
                assert.equal(error.message, message)
                assert.equal(String(error), `SyntaxError: ${message}`)
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                const expected = { code, stage: 'lexer', severity: 'error', message, location, span }
                assert.deepEqual(error.diagnostic, expected)
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), expected)
                return true
            })
        }
    })
}

test('structured lexer failures leave successful tokens unchanged', () => {
    assert.deepEqual(lex('/*x*/\nfoo.o99 "😀"'), [
        { type: 'COMMENT', lexeme: '/*x*/', line: 1, col: 1 },
        { type: 'IDENT', lexeme: 'foo', line: 2, col: 1 },
        { type: 'DOT', lexeme: '.', line: 2, col: 4 },
        { type: 'OUTPUT_REF', lexeme: 'o99', line: 2, col: 5 },
        { type: 'STRING', lexeme: '😀', line: 2, col: 9 },
        { type: 'EOF', lexeme: '', line: 2, col: 13 }
    ])
})
