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
                    location: { line, column }, span: null
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
                    location: { line: 2, column: 9 }, span: null
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
                location: { line: 2, column: 24 }, span: null
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
                    location: { line, column }, span: null
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
                    location: { line, column }, span: null
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
