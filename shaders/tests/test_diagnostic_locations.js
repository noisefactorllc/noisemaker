import assert from 'node:assert/strict'
import test from 'node:test'
import { compile, lex, parse, validate } from '../src/lang/index.js'
import { registerOp } from '../src/lang/ops.js'
import { registerStarterOps } from '../src/lang/validator.js'

// Independent oracle: the source-derived span of the token whose one-based
// coordinates are (line, column), per the documented convention (LF-only line
// breaks; CR and tabs each occupy one column; UTF-16 code-unit columns).
const sourcePosition = (source, line, column) => {
    const matches = lex(source).filter(token => token.position.line === line && token.position.column === column)
    assert.equal(matches.length, 1)
    return { start: matches[0].position.start, end: matches[0].position.end }
}

registerOp('synth.diagProbe', { name: 'diagProbe', args: [] })
registerStarterOps(['synth.diagProbe'])
registerOp('synth.diagFilter', { name: 'diagFilter', args: [] })

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


const parserExpectFailures = [
    ['opening parenthesis', 'search synth\nrender o0', 'P001', "Expect '(' at line 2 col 8", 2, 8],
    ['closing parenthesis at EOF', 'search synth\nrender(o0', 'P002', "Expect ')' at line 2 col 10", 2, 10],
    ['identifier', 'search synth\nlet = 1', 'P001', 'Expected identifier at line 2 col 5', 2, 5],
    ['assignment sign', 'search synth\nlet x 1', 'P001', "Expect '=' at line 2 col 7", 2, 7],
    ['block opening', 'search synth\nif(true) return 1', 'P001', "Expect '{' at line 2 col 10", 2, 10],
    ['end of input', 'search synth\nrender(o0) xyz', 'P001', 'Expected end of input at line 2 col 12', 2, 12],
    ['call closing parenthesis', 'search synth\nfoo(1', 'P002', "Expect ')' at line 2 col 6", 2, 6],
    ['write3d separator', 'search synth\nfoo().write3d(tex3d0 geo0)', 'P001', "Expect ',' between tex3d and geo in write3d() at line 2 col 22", 2, 22],
    ['CRLF and tab', '// 😀\r\nsearch synth\r\n\trender(o0', 'P002', "Expect ')' at line 3 col 11", 3, 11],
    ['UTF-16 column', 'search synth\nlet x = "😀"; render o0', 'P001', "Expect '(' at line 2 col 22", 2, 22]
]

for (const [name, source, code, message, line, column] of parserExpectFailures) {
    test(`parser expectation diagnostic: ${name}`, () => {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, message)
                assert.equal(String(error), `SyntaxError: ${message}`)
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                const expected = {
                    code, stage: 'parser', severity: 'error', message,
                    location: { line, column }, span: sourcePosition(source, line, column)
                }
                assert.deepEqual(error.diagnostic, expected)
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), expected)
                return true
            })
        }
    })
}

test('parser expectation diagnostics represent unavailable caller-token coordinates explicitly', () => {
    for (const coordinates of [{}, { line: 1 }, { line: 0, col: 1 }, { line: 1, col: NaN }]) {
        const tokens = lex('search synth\nrender o0').map(token => {
            if (token.type !== 'OUTPUT_REF') return token
            return { type: token.type, lexeme: token.lexeme, ...coordinates }
        })
        assert.throws(() => parse(tokens), error => {
            assert.equal(error.message, `Expect '(' at line ${coordinates.line} col ${coordinates.col}`)
            assert.deepEqual(error.diagnostic, {
                code: 'P001', stage: 'parser', severity: 'error', message: error.message,
                location: null, span: null
            })
            assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), error.diagnostic)
            return true
        })
    }
})

const automationFailures = [
    ['osc(type: oscKind.sine, bogus: 1)', "osc() unknown parameter 'bogus'", '. Valid: type, min, max, speed, offset, seed'],
    ['midi(1, 2, 3, 4, 5, 6)', 'midi() name, id, cc, nrpn, zone and members are keyword-only'],
    ['midi(bogus: 1)', "midi() unknown parameter 'bogus'", '. Valid: channel, mode, min, max, sensitivity, name, id, cc, nrpn, zone, members'],
    ['midi(1, 2, 3, 4, 5, channel: 1)', 'midi() has an excess positional argument'],
    ['midi()', "midi() requires 'channel' or 'zone' argument"],
    ['midi(1, zone: 1)', "midi() 'channel' and 'zone' are mutually exclusive"],
    ['midi(1, members: 2)', "midi() 'members' requires 'zone'"],
    ['midi(1, id: "port")', "midi() 'id' requires readable 'name'"],
    ['midi(1, name: 1)', "midi() 'name' requires a quoted string"],
    ['midi(1, name: "")', "midi() 'name' must not be empty"],
    ['midi(1, name: "port", id: 1)', "midi() 'id' requires a quoted string"],
    ['midi(1, name: "port", id: "")', "midi() 'id' must not be empty"],
    ['audio(1, 2, 3, 4)', 'audio() channel, name and id are keyword-only'],
    ['audio(bogus: 1)', "audio() unknown parameter 'bogus'", '. Valid: band, min, max, channel, name, id'],
    ['audio(1, 2, 3, band: 1)', 'audio() has an excess positional argument'],
    ['audio()', "audio() requires 'band' argument"],
    ['audio(1, id: "device")', "audio() 'id' requires readable 'name'"],
    ['audio(1, name: "device")', "audio() selected device requires both 'name' and 'channel'"],
    ['audio(1, channel: 1, name: 1)', "audio() 'name' requires a quoted string"],
    ['audio(1, channel: 1, name: "")', "audio() 'name' must not be empty"],
    ['audio(1, channel: 1, name: "device", id: 1)', "audio() 'id' requires a quoted string"],
    ['audio(1, channel: 1, name: "device", id: "")', "audio() 'id' must not be empty"]
]

for (const [invocation, prefix, suffix = ''] of automationFailures) {
    test(`parser automation diagnostic: ${invocation}`, () => {
        const source = `search synth\nlet x = ${invocation}`
        const message = `${prefix} at line 2 col 9${suffix}`
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, message)
                assert.equal(String(error), `SyntaxError: ${message}`)
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                const expected = {
                    code: 'P003', stage: 'parser', severity: 'error', message,
                    location: { line: 2, column: 9 }, span: sourcePosition(source, 2, 9)
                }
                assert.deepEqual(error.diagnostic, expected)
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), expected)
                return true
            })
        }
    })
}

test('parser automation diagnostics locate invocation names after CRLF, tabs, and UTF-16 text', () => {
    const source = 'search synth\r\n\tlet x = "😀"; let y = midi()'
    for (const entryPoint of [source => parse(lex(source)), compile]) {
        assert.throws(() => entryPoint(source), error => {
            assert.equal(error.message, "midi() requires 'channel' or 'zone' argument at line 2 col 24")
            assert.deepEqual(error.diagnostic, {
                code: 'P003', stage: 'parser', severity: 'error', message: error.message,
                location: { line: 2, column: 24 }, span: sourcePosition(source, 2, 24)
            })
            return true
        })
    }
})

test('parser automation diagnostics preserve unavailable caller-token coordinates', () => {
    for (const invocation of ['osc(type: 1, bogus: 1)', 'midi()', 'audio()']) {
        for (const coordinates of [{}, { line: 1 }, { line: 0, col: 1 }, { line: 1, col: NaN }]) {
            const tokens = lex(`search synth\nlet x = ${invocation}`).map(token => {
                if (!['osc', 'midi', 'audio'].includes(token.lexeme)) return token
                return { type: token.type, lexeme: token.lexeme, ...coordinates }
            })
            assert.throws(() => parse(tokens), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.ok(error.message.includes(`at line ${coordinates.line} col ${coordinates.col}`))
                assert.deepEqual(error.diagnostic, {
                    code: 'P003', stage: 'parser', severity: 'error', message: error.message,
                    location: null, span: null
                })
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), error.diagnostic)
                return true
            })
        }
    }
})

test('valid automation invocations retain AST defaults and keys', () => {
    const source = 'search synth\nlet a = osc(); let b = midi(1); let c = audio(audioBand.low)'
    assert.deepEqual(parse(lex(source)).vars.map(variable => variable.expr), [
        {
            type: 'Oscillator', oscType: { type: 'Member', path: ['oscKind', 'sine'] },
            min: { type: 'Number', value: 0 }, max: { type: 'Number', value: 1 },
            speed: { type: 'Number', value: 1 }, offset: { type: 'Number', value: 0 },
            seed: { type: 'Number', value: 1 }, loc: { line: 2, col: 9 }
        },
        {
            type: 'Midi', channel: { type: 'Number', value: 1 },
            mode: { type: 'Member', path: ['midiMode', 'velocity'] },
            min: { type: 'Number', value: 0 }, max: { type: 'Number', value: 1 },
            sensitivity: { type: 'Number', value: 1 }, cc: undefined, nrpn: undefined,
            zone: undefined, members: undefined, name: undefined, id: undefined,
            loc: { line: 2, col: 24 }
        },
        {
            type: 'Audio', band: { type: 'Member', path: ['audioBand', 'low'] },
            min: { type: 'Number', value: 0 }, max: { type: 'Number', value: 1 },
            channel: undefined, name: undefined, id: undefined, loc: { line: 2, col: 41 }
        }
    ])
})

const missingSearchMessage = "Missing required 'search' directive. Every program must start with 'search <namespace>, ...' to specify namespace search order."
const searchFailures = [
    ['empty program', '', missingSearchMessage, 1, 1],
    ['missing directive after statements', 'let x = 1', missingSearchMessage, 1, 10],
    ['duplicate directive', 'search synth search filter', 'Only one search directive is allowed per program at line 1 col 14', 1, 14],
    ['invalid namespace', 'search bogus', "Invalid namespace 'bogus' at line 1 col 8. Valid namespaces: io, classicNoisedeck, synth, mixer, filter, render, points, synth3d, filter3d, user", 1, 8],
    ['missing first namespace', 'search', 'Expected namespace identifier after search at line 1 col 7', 1, 7],
    ['missing additional namespace', 'search synth,', 'Expected namespace identifier after comma at line 1 col 14', 1, 14],
    ['misplaced directive', 'let x = 1; search synth', "'search' directive must appear before other statements at line 1 col 12", 1, 12],
    ['nested directive', 'search synth\nif(true) { search filter }', "'search' directive is only allowed at the start of the program at line 2 col 12", 2, 12],
    ['CRLF and tab', '// 😀\r\n\tsearch 1', 'Expected namespace identifier after search at line 2 col 9', 2, 9],
    ['UTF-16 column', 'search synth\nlet x = "😀"; search filter', "'search' directive must appear before other statements at line 2 col 15", 2, 15]
]

for (const [name, source, message, line, column] of searchFailures) {
    test(`parser search diagnostic: ${name}`, () => {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, message)
                assert.equal(String(error), `SyntaxError: ${message}`)
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                const expected = {
                    code: 'P004', stage: 'parser', severity: 'error', message,
                    location: { line, column }, span: sourcePosition(source, line, column)
                }
                assert.deepEqual(error.diagnostic, expected)
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), expected)
                return true
            })
        }
    })
}

test('parser search diagnostics preserve unavailable caller-token coordinates', () => {
    for (const [, source] of searchFailures) {
        for (const coordinates of [{}, { line: 1 }, { line: 0, col: 1 }, { line: 1, col: NaN }]) {
            const tokens = lex(source).map(({ type, lexeme }) => ({ type, lexeme, ...coordinates }))
            assert.throws(() => parse(tokens), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.deepEqual(error.diagnostic, {
                    code: 'P004', stage: 'parser', severity: 'error', message: error.message,
                    location: null, span: null
                })
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), error.diagnostic)
                return true
            })
        }
    }
})

test('valid search directives retain namespace order, keyword namespaces, and compiled indexes', () => {
    const source = '/* leading */ search render, synth, synth; diagProbe().write(o0)'
    const ast = parse(lex(source))
    assert.deepEqual(ast.namespace.searchOrder, ['render', 'synth', 'synth'])
    const result = compile(source)
    assert.deepEqual(result.searchNamespaces, ['render', 'synth', 'synth'])
    assert.deepEqual(result.diagnostics, [])
    assert.deepEqual(result.plans[0].chain, [
        { op: 'synth.diagProbe', args: {}, from: null, temp: 0 },
        { op: '_write', args: { tex: { kind: 'output', name: 'o0' } }, from: 0, temp: 1, builtin: true }
    ])
    assert.deepEqual(Object.keys(result).sort(), ['diagnostics', 'plans', 'render', 'searchNamespaces', 'vars'])
})

const outputFailures = [
    ['invalid render target', 'search synth\nrender(1)', 'Expected output reference in render()', 2, 8],
    ['render target at EOF', 'search synth\nrender(', 'Expected output reference in render()', 2, 8],
    ['write in expression', 'search synth\nlet x = diagProbe().write(o0)', "'.write()' is only allowed in statement context at line 2 col 21", 2, 21],
    ['write3d in expression', 'search synth\nlet x = diagProbe().write3d(vol0, geo0)', "'.write()' is only allowed in statement context at line 2 col 21", 2, 21],
    ['missing write surface', 'search synth\ndiagProbe().write()', 'write() requires an explicit surface reference (e.g., o0, o1, xyz0, vel0, rgba0, mesh0, none) at line 2 col 19', 2, 19],
    ['write surface at EOF', 'search synth\ndiagProbe().write(', 'write() requires an explicit surface reference (e.g., o0, o1, xyz0, vel0, rgba0, mesh0, none) at line 2 col 19', 2, 19],
    ['invalid write surface', 'search synth\ndiagProbe().write(1)', 'write() requires an explicit surface reference (e.g., o0, o1, xyz0, vel0, rgba0, mesh0, none) at line 2 col 19', 2, 19],
    ['invalid write3d texture', 'search synth\ndiagProbe().write3d(1, geo0)', 'Expected tex3d reference in write3d() at line 2 col 21', 2, 21],
    ['write3d texture at EOF', 'search synth\ndiagProbe().write3d(', 'Expected tex3d reference in write3d() at line 2 col 21', 2, 21],
    ['invalid write3d geometry', 'search synth\ndiagProbe().write3d(vol0, 1)', 'Expected geo reference in write3d() at line 2 col 27', 2, 27],
    ['write3d geometry at EOF', 'search synth\ndiagProbe().write3d(vol0,', 'Expected geo reference in write3d() at line 2 col 26', 2, 26],
    ['CRLF and tab render target', '// 😀\r\nsearch synth\r\n\trender("😀")', 'Expected output reference in render()', 3, 9],
    ['UTF-16 render target column', 'search synth\nlet x = "😀"; render(none)', 'Expected output reference in render()', 2, 22]
]

for (const [name, source, message, line, column] of outputFailures) {
    test(`parser output diagnostic: ${name}`, () => {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, message)
                assert.equal(String(error), `SyntaxError: ${message}`)
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                const expected = {
                    code: 'P005', stage: 'parser', severity: 'error', message,
                    location: { line, column }, span: sourcePosition(source, line, column)
                }
                assert.deepEqual(error.diagnostic, expected)
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), expected)
                return true
            })
        }
    })
}

test('parser output diagnostics represent unavailable caller-token coordinates', () => {
    for (const [, source] of outputFailures) {
        for (const coordinates of [{}, { line: 1 }, { line: 0, col: 1 }, { line: 1, col: NaN }]) {
            const tokens = lex(source).map(({ type, lexeme }) => ({ type, lexeme, ...coordinates }))
            assert.throws(() => parse(tokens), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.deepEqual(error.diagnostic, {
                    code: 'P005', stage: 'parser', severity: 'error', message: error.message,
                    location: null, span: null
                })
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), error.diagnostic)
                return true
            })
        }
    }
})

test('output syntax preserves shared expectation diagnostic precedence', () => {
    const cases = [
        ['search synth\nrender o0', 'P001', "Expect '(' at line 2 col 8"],
        ['search synth\nrender(o0', 'P002', "Expect ')' at line 2 col 10"],
        ['search synth\nrender(o0) render(o1)', 'P001', 'Expected end of input at line 2 col 12'],
        ['search synth\ndiagProbe().write(o0', 'P002', "Expect ')' at line 2 col 21"],
        ['search synth\ndiagProbe().write3d(vol0 geo0)', 'P001', "Expect ',' between tex3d and geo in write3d() at line 2 col 26"]
    ]
    for (const [source, code, message] of cases) {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(error.message, message)
                assert.equal(error.diagnostic.code, code)
                return true
            })
        }
    }
})

test('valid output operations retain surface forms, render selection, and compiled indexes', () => {
    for (const [name, type] of [
        ['o0', 'OutputRef'], ['xyz0', 'XyzRef'], ['vel0', 'VelRef'],
        ['rgba0', 'RgbaRef'], ['mesh0', 'MeshRef'], ['none', 'OutputRef']
    ]) {
        const ast = parse(lex(`search synth\ndiagProbe().write(${name})`))
        assert.deepEqual(ast.plans[0].chain[1], {
            type: 'Write', surface: { type, name }, loc: { line: 2, col: 13 }
        })
        assert.deepEqual(ast.plans[0].write, { type, name })
        assert.equal(ast.render, null)
    }
    for (const [tex, texType, geo, geoType] of [
        ['vol0', 'VolRef', 'geo0', 'GeoRef'], ['o0', 'OutputRef', 'o1', 'OutputRef'],
        ['volume', 'Ident', 'geometry', 'Ident']
    ]) {
        const ast = parse(lex(`search synth\ndiagProbe().write3d(${tex}, ${geo})`))
        assert.deepEqual(ast.plans[0].chain[1], {
            type: 'Write3D', tex3d: { type: texType, name: tex },
            geo: { type: geoType, name: geo }, loc: { line: 2, col: 13 }
        })
    }
    const result = compile('search synth\ndiagProbe().write(o1) render(o1)')
    assert.deepEqual(result.diagnostics, [])
    assert.equal(result.render, 'o1')
    assert.deepEqual(result.plans[0].chain, [
        { op: 'synth.diagProbe', args: {}, from: null, temp: 0 },
        { op: '_write', args: { tex: { kind: 'output', name: 'o1' } }, from: 0, temp: 1, builtin: true }
    ])
    assert.deepEqual(Object.keys(result).sort(), ['diagnostics', 'plans', 'render', 'searchNamespaces', 'vars'])
})

const subchainFailures = [
    ['non-string argument', 'search synth\nread(o0).subchain(name: 1) { .diagProbe() }', 'Expected string value for subchain name at line 2 col 25', 2, 25],
    ['argument at EOF', 'search synth\nread(o0).subchain(name:', 'Expected string value for subchain name at line 2 col 24', 2, 24],
    ['missing body dot', 'search synth\nread(o0).subchain() { diagProbe() }', "Expected '.' before chain element in subchain body at line 2 col 23", 2, 23],
    ['body at EOF', 'search synth\nread(o0).subchain() {', "Expected '.' before chain element in subchain body at line 2 col 22", 2, 22],
    ['empty body', 'search synth\nread(o0).subchain() {}', 'Subchain body cannot be empty at line 2 col 10', 2, 10],
    ['comment-only body', 'search synth\nread(o0).subchain() { /* empty */ }', 'Subchain body cannot be empty at line 2 col 10', 2, 10],
    ['CRLF tab and UTF-16 argument', '// 😀\r\nsearch synth\r\n\tread(o0).subchain(name: "😀", id: 1) { .diagProbe() }', 'Expected string value for subchain id at line 3 col 36', 3, 36],
    ['missing dot after comment', 'search synth\nread(o0).subchain() { /* 😀 */ missing() }', "Expected '.' before chain element in subchain body at line 2 col 32", 2, 32],
    ['unclosed nonempty body', 'search synth\nread(o0).subchain() { .diagProbe()', "Expected '.' before chain element in subchain body at line 2 col 35", 2, 35]
]

for (const [name, source, message, line, column] of subchainFailures) {
    test(`parser subchain diagnostic: ${name}`, () => {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, message)
                assert.equal(String(error), `SyntaxError: ${message}`)
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                const expected = {
                    code: 'P006', stage: 'parser', severity: 'error', message,
                    location: { line, column }, span: sourcePosition(source, line, column)
                }
                assert.deepEqual(error.diagnostic, expected)
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), expected)
                assert.deepEqual(Object.getOwnPropertyDescriptor(error, 'diagnostic'), {
                    value: expected, writable: false, enumerable: false, configurable: false
                })
                return true
            })
        }
    })
}

test('subchain diagnostics preserve unavailable caller-token coordinates', () => {
    for (const [, source] of subchainFailures) {
        for (const coordinates of [{}, { line: 1 }, { line: 0, col: 1 }, { line: 1, col: NaN }]) {
            const tokens = lex(source).map(({ type, lexeme }) => ({ type, lexeme, ...coordinates }))
            assert.throws(() => parse(tokens), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.deepEqual(error.diagnostic, {
                    code: 'P006', stage: 'parser', severity: 'error', message: error.message,
                    location: null, span: null
                })
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), error.diagnostic)
                return true
            })
        }
    }
})

test('subchain syntax preserves shared expectation diagnostic precedence', () => {
    for (const [source, code, message] of [
        ['search synth\nread(o0).subchain(1) {}', 'P002', "Expect ')' after subchain arguments at line 2 col 19"],
        ['search synth\nread(o0).subchain() { . }', 'P001', 'Expected identifier at line 2 col 25']
    ]) {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(error.message, message)
                assert.equal(error.diagnostic.code, code)
                return true
            })
        }
    }
})

test('valid subchains preserve permissive arguments, defaults, body and compiled indexes', () => {
    for (const [args, name, id] of [
        ['', null, null], ['"positional"', 'positional', null],
        ['name: "named", id: "s"', 'named', 's'],
        ['foo: "x" name: "a" name: "b" id: "s"', 'b', 's']
    ]) {
        const source = `search synth\nread(o0).subchain(${args}) { .diagFilter() }.write(o1)`
        const ast = parse(lex(source))
        assert.deepEqual(ast.plans[0].chain[1], {
            type: 'Subchain', name, id, body: [{ type: 'Call', name: 'diagFilter', args: [] }],
            loc: { line: 2, col: 10 }
        })
        const result = compile(source)
        assert.deepEqual(result.diagnostics, [])
        assert.deepEqual(result.plans[0].chain, [
            { op: '_read', args: { tex: { kind: 'output', name: 'o0' } }, from: null, temp: 0, builtin: true },
            { op: '_subchain_begin', args: { name, id }, from: 0, temp: 1, builtin: true },
            { op: 'synth.diagFilter', args: {}, from: 1, temp: 2 },
            { op: '_subchain_end', args: { name, id }, from: 2, temp: 3, builtin: true },
            { op: '_write', args: { tex: { kind: 'output', name: 'o1' } }, from: 3, temp: 4, builtin: true }
        ])
        assert.equal(result.render, null)
        assert.deepEqual(Object.keys(result).sort(), ['diagnostics', 'plans', 'render', 'searchNamespaces', 'vars'])
    }
})

const callFormFailures = [
    ['from named arguments', 'search synth\nlet x = from(a: 1, b: 2)', "'from' does not support named arguments at line 2 col 9", 2, 9],
    ['from missing second argument', 'search synth\nlet x = from(synth)', "'from' requires exactly two arguments (namespace, call) at line 2 col 9", 2, 9],
    ['from namespace not an identifier', 'search synth\nlet x = from(1, probe())', "'from' namespace argument must be an identifier at line 2 col 9", 2, 9],
    ['from second argument not a call', 'search synth\nlet x = from(synth, 1)', "'from' second argument must be a call expression at line 2 col 9", 2, 9],
    ['inline namespace', 'search synth\nnd.noise()', "Inline namespace syntax 'nd.noise()' is not allowed. Use 'search nd' at the start of the program instead, at line 2 col 1", 2, 1],
    ['positional then keyword', 'search synth\ndiagProbe(1, x: 2)', 'Cannot mix positional and keyword arguments at line 2 col 14', 2, 14],
    ['keyword then positional', 'search synth\ndiagProbe(x: 1, 2)', 'Cannot mix positional and keyword arguments at line 2 col 17', 2, 17],
    ['CRLF tab and UTF-16', '// 😀\r\nsearch synth\r\n\tdiagProbe(1, x: 2)', 'Cannot mix positional and keyword arguments at line 3 col 15', 3, 15],
    ['UTF-16 inline namespace column', 'search synth\nlet x = "😀"; nd.noise()', "Inline namespace syntax 'nd.noise()' is not allowed. Use 'search nd' at the start of the program instead, at line 2 col 15", 2, 15]
]

for (const [name, source, message, line, column] of callFormFailures) {
    test(`parser call form diagnostic: ${name}`, () => {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, message)
                assert.equal(String(error), `SyntaxError: ${message}`)
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                const expected = {
                    code: 'P007', stage: 'parser', severity: 'error', message,
                    location: { line, column }, span: sourcePosition(source, line, column)
                }
                assert.deepEqual(error.diagnostic, expected)
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), expected)
                assert.deepEqual(Object.getOwnPropertyDescriptor(error, 'diagnostic'), {
                    value: expected, writable: false, enumerable: false, configurable: false
                })
                return true
            })
        }
    })
}

const remainingExpectFailures = [
    ['expected expression in assignment', 'search synth\nlet x = ;', "Expected expression after '=' at line 2 col 9", 2, 9],
    ['expected expression in keyword argument', 'search synth\ndiagProbe(a: )', "Expected expression after '=' at line 2 col 14", 2, 14],
    ['expected closing bracket', 'search synth\nlet x = [1 2]', "Expected ']' at line 2 col 12", 2, 12],
    ['expected identifier after dot', 'search synth\nlet x = foo.+', "Expected identifier after '.' at line 2 col 13", 2, 13],
    ['unexpected primary token', 'search synth\ndiagProbe(; 1)', 'Unexpected token SEMICOLON at line 2 col 11', 2, 11],
    ['UTF-16 column', 'search synth\nlet x = "😀"; let y = [1 2]', "Expected ']' at line 2 col 26", 2, 26]
]

for (const [name, source, message, line, column] of remainingExpectFailures) {
    test(`parser remaining expectation diagnostic: ${name}`, () => {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, message)
                assert.equal(String(error), `SyntaxError: ${message}`)
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                const expected = {
                    code: 'P001', stage: 'parser', severity: 'error', message,
                    location: { line, column }, span: sourcePosition(source, line, column)
                }
                assert.deepEqual(error.diagnostic, expected)
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), expected)
                return true
            })
        }
    })
}

test('number coercion diagnostics represent unavailable locations explicitly', () => {
    for (const source of ['search synth\nlet x = 1 + o0', 'search synth\nlet x = diagProbe() + 1']) {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, 'Expected number')
                assert.equal(String(error), 'SyntaxError: Expected number')
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                assert.deepEqual(error.diagnostic, {
                    code: 'P001', stage: 'parser', severity: 'error',
                    message: 'Expected number', location: null, span: null
                })
                return true
            })
        }
    }
})

const coercionFailures = [
    ['array addition without drift', 'search synth\nlet y = [1] + 1', 2, 9],
    ['array multiplication without drift', 'search synth\nlet y = 1 * [1]', 2, 13],
    ['array unary minus without drift', 'search synth\nlet y = -[1]', 2, 10],
    ['array addition after multiline function', 'search synth\nlet f = () => (1\n + 2); let y = [1] + 1', 3, 16],
    ['array multiplication after multiline function', 'search synth\nlet f = () => (1\n + 2); let y = 1 * [1]', 3, 20],
    ['array unary minus after multiline function', 'search synth\nlet f = () => (1\n + 2); let y = -[1]', 3, 17]
]

for (const [name, source, line, column] of coercionFailures) {
    test(`number coercion diagnostic: ${name}`, () => {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, 'Expected number')
                assert.equal(String(error), 'SyntaxError: Expected number')
                assert.deepEqual(Object.keys(error), [])
                assert.equal(JSON.stringify(error), '{}')
                assert.deepEqual(error.diagnostic, {
                    code: 'P001', stage: 'parser', severity: 'error',
                    message: 'Expected number',
                    location: { line, column },
                    span: sourcePosition(source, line, column)
                })
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), error.diagnostic)
                return true
            })
        }
    })
}

test('array literal ASTs keep their public shape with private source provenance', () => {
    const source = 'search synth\nlet y = [1, 2]'
    const array = parse(lex(source)).vars[0].expr
    assert.deepEqual(array, {
        type: 'ArrayLiteral',
        elements: [{ type: 'Number', value: 1 }, { type: 'Number', value: 2 }],
        loc: { line: 2, col: 9 }
    })
    assert.deepEqual(JSON.parse(JSON.stringify(array)), {
        type: 'ArrayLiteral',
        elements: [{ type: 'Number', value: 1 }, { type: 'Number', value: 2 }],
        loc: { line: 2, col: 9 }
    })
    assert.deepEqual(Object.getOwnPropertyDescriptor(array, 'position'), {
        value: { line: 2, column: 9, start: 21, end: 22 },
        writable: false, enumerable: false, configurable: false
    })
})

test('call form diagnostics preserve unavailable caller-token coordinates', () => {
    for (const [, source] of callFormFailures) {
        for (const coordinates of [{}, { line: 1 }, { line: 0, col: 1 }, { line: 1, col: NaN }]) {
            const tokens = lex(source).map(({ type, lexeme }) => ({ type, lexeme, ...coordinates }))
            assert.throws(() => parse(tokens), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.deepEqual(error.diagnostic, {
                    code: 'P007', stage: 'parser', severity: 'error', message: error.message,
                    location: null, span: null
                })
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), error.diagnostic)
                return true
            })
        }
    }
})

test('remaining expectation diagnostics preserve unavailable caller-token coordinates', () => {
    for (const [, source] of remainingExpectFailures) {
        for (const coordinates of [{}, { line: 1 }, { line: 0, col: 1 }, { line: 1, col: NaN }]) {
            const tokens = lex(source).map(({ type, lexeme }) => ({ type, lexeme, ...coordinates }))
            assert.throws(() => parse(tokens), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.deepEqual(error.diagnostic, {
                    code: 'P001', stage: 'parser', severity: 'error', message: error.message,
                    location: null, span: null
                })
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)), error.diagnostic)
                return true
            })
        }
    }
})

test('valid call forms retain from-override namespaces and mixed automation arguments', () => {
    const ast = parse(lex('search synth\nlet x = from(synth, probe())'))
    assert.deepEqual(ast.vars[0].expr, {
        type: 'Call', name: 'probe', args: [],
        namespace: {
            name: 'synth', path: ['synth'], explicit: true, source: 'from',
            resolved: 'synth', searchOrder: ['synth'], fromOverride: true
        }
    })
    const mixed = parse(lex('search synth\nlet a = midi(1, channel: 2)'))
    assert.equal(mixed.vars[0].expr.channel.value, 2)
})

const parserDriftFailures = [
    {
        name: 'multiline function token drift',
        source: 'search synth\nlet x = () => (1\n + 2); render o0',
        code: 'P001', message: "Expect '(' at line 2 col 32",
        location: { line: 3, column: 15 }, span: { start: 44, end: 46 }
    },
    {
        name: 'escaped LF string drift',
        source: 'search synth\nlet x = "a\\\nb"; render o0',
        code: 'P001', message: "Expect '(' at line 2 col 24",
        location: { line: 3, column: 12 }, span: { start: 36, end: 38 }
    }
]

for (const { name, source, code, message, location, span } of parserDriftFailures) {
    test(`parser diagnostic source coordinates survive legacy scanner drift: ${name}`, () => {
        for (const entryPoint of [source => parse(lex(source)), compile]) {
            assert.throws(() => entryPoint(source), error => {
                assert.equal(Object.getPrototypeOf(error), SyntaxError.prototype)
                assert.equal(error.message, message)
                assert.deepEqual(error.diagnostic, {
                    code, stage: 'parser', severity: 'error', message, location, span
                })
                assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)),
                    { code, stage: 'parser', severity: 'error', message, location, span })
                return true
            })
        }
    })
}

test('token positions match an independent source-walk oracle across scanner constructs', () => {
    const sources = [
        'search synth\nrender o0',
        '// 😀\r\nsearch synth\r\n\tlet x = "a\\\nb"; render o0',
        'search synth\nlet x = () => (1\n + 2); render o0',
        '/* a\nb */ search synth\n"""\nmulti\nline\n""" render(o0)',
        'search synth\nlet x = [1 2]; let y = "😀"; let z = o0',
        'search synth\nread(o0).subchain(name: "s") { .diagFilter() }.write(o1)'
    ]
    for (const source of sources) {
        for (const token of lex(source)) {
            const { line, column, start, end } = token.position
            assert.ok(Number.isInteger(start) && start >= 0, `start for ${token.type}`)
            assert.ok(Number.isInteger(end) && end >= start && end <= source.length, `end for ${token.type}`)
            assert.equal(source.slice(start, end).length > 0 || token.type === 'EOF', true)
            // Independent one-based line/column computation from the start offset
            let oracleLine = 1
            let oracleColumn = 1
            for (let offset = 0; offset < start; offset++) {
                if (source[offset] === '\n') { oracleLine++; oracleColumn = 1 }
                else { oracleColumn++ }
            }
            assert.deepEqual({ line, column }, { line: oracleLine, column: oracleColumn },
                `${token.type} at ${JSON.stringify(source.slice(start, start + 12))}`)
        }
    }
})

test('successful tokens retain their public shape with non-enumerable positions', () => {
    const tokens = lex('/*x*/\nfoo.o99 "😀"')
    assert.deepEqual(tokens, [
        { type: 'COMMENT', lexeme: '/*x*/', line: 1, col: 1 },
        { type: 'IDENT', lexeme: 'foo', line: 2, col: 1 },
        { type: 'DOT', lexeme: '.', line: 2, col: 4 },
        { type: 'OUTPUT_REF', lexeme: 'o99', line: 2, col: 5 },
        { type: 'STRING', lexeme: '😀', line: 2, col: 9 },
        { type: 'EOF', lexeme: '', line: 2, col: 13 }
    ])
    assert.deepEqual(JSON.parse(JSON.stringify(tokens)), tokens.map(({ type, lexeme, line, col }) => ({ type, lexeme, line, col })))
    const descriptor = Object.getOwnPropertyDescriptor(tokens[1], 'position')
    assert.equal(descriptor.enumerable, false)
    assert.deepEqual(descriptor.value, { line: 2, column: 1, start: 6, end: 9 })
})

test('caller-supplied tokens without source positions retain token coordinates and null spans', () => {
    const tokens = lex('search synth\nrender o0').map(({ type, lexeme }) => ({ type, lexeme, line: 2, col: 8 }))
    assert.throws(() => parse(tokens), error => {
        assert.equal(error.message, "Expect '(' at line 2 col 8")
        assert.deepEqual(error.diagnostic, {
            code: 'P001', stage: 'parser', severity: 'error', message: error.message,
            location: { line: 2, column: 8 }, span: null
        })
        return true
    })
})
