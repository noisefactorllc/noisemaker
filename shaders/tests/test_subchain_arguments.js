import assert from 'node:assert/strict'
import test from 'node:test'
import { compile, lex, parse, unparse, validate } from '../src/lang/index.js'
import { registerOp } from '../src/lang/ops.js'
import { registerStarterOps } from '../src/lang/validator.js'

// GAP-027: subchain-argument validation contract.
//
// Enforced key set: `name` and `id` (string-literal values). A single leading
// positional string literal is shorthand for `name`. Unknown keys are
// discarded from the AST (which projects only name/id) and reported.
// Separator rule: keyword arguments must be comma-separated.
// Duplicate rule: the last occurrence of a key wins (historical overwrite
// behavior); every extra occurrence is reported.
// Default parse acceptance is unchanged: all historically accepted programs
// still parse with identical AST/compiled shape. Reports ride in the
// compile()/validate() diagnostics list with stable codes P008 (unknown or
// discarded key), P009 (duplicate key), P010 (missing separator).
// Opt-in strict validation via parse(tokens, { subchainArguments: 'strict' })
// or compile(src, { subchainArguments: 'strict' }) rejects the same
// conditions with SyntaxError carrying the same codes.

registerOp('synth.subchainProbe', { name: 'subchainProbe', args: [] })
registerStarterOps(['synth.subchainProbe'])
registerOp('synth.subchainFilter', { name: 'subchainFilter', args: [] })

const SUB = 'search synth\n'

const subchainSource = (args, body = '.subchainFilter()') =>
    `${SUB}subchainProbe()\n  .subchain(${args}) {\n    ${body}\n  }\n  .write(o0)`

const findDiagnostics = (result, code) => result.diagnostics.filter(d => d.code === code)

const locationOf = (source, lexeme, occurrence = 0) => {
    const tokens = lex(source).filter(t => t.type !== 'COMMENT')
    const indexes = []
    tokens.forEach((token, index) => {
        if (token.lexeme === lexeme) { indexes.push(index) }
    })
    const token = tokens[indexes[occurrence]]
    assert.ok(token, `token ${lexeme} not found`)
    return { line: token.position.line, column: token.position.column, start: token.position.start, end: token.position.end }
}

test('default parse accepts and reports an unknown subchain key without changing the AST', () => {
    const source = subchainSource('nme: "typo", name: "ok"')
    const result = compile(source)
    const subchain = result.plans[0].chain.find(step => step.op === '_subchain_begin')
    assert.equal(subchain.args.name, 'ok')
    assert.equal(subchain.args.id, null)
    const reports = findDiagnostics(result, 'P008')
    assert.equal(reports.length, 1)
    assert.match(reports[0].message, /nme/)
    const at = locationOf(source, 'nme')
    assert.deepEqual(reports[0].location, { line: at.line, column: at.column })
    assert.equal(reports[0].severity, 'warning')
})

test('unknown subchain keys are discarded from the AST projection and unparse output', () => {
    const clean = compile(subchainSource('name: "ok"'))
    const dirty = compile(subchainSource('nme: "typo", name: "ok"'))
    assert.deepEqual(JSON.parse(JSON.stringify(dirty.plans)), JSON.parse(JSON.stringify(clean.plans)))
    assert.equal(unparse(dirty), unparse(clean))
})

test('default parse reports each duplicate subchain key and the last value wins', () => {
    const source = subchainSource('name: "first", name: "second"')
    const result = compile(source)
    const begin = result.plans[0].chain.find(step => step.op === '_subchain_begin')
    assert.equal(begin.args.name, 'second')
    const reports = findDiagnostics(result, 'P009')
    assert.equal(reports.length, 1)
    assert.match(reports[0].message, /name/)
    const at = locationOf(source, 'name', 1)
    assert.deepEqual(reports[0].location, { line: at.line, column: at.column })
})

test('duplicate id keys are reported with the same precedence rule', () => {
    const source = subchainSource('id: "a", id: "b", name: "n"')
    const result = compile(source)
    const begin = result.plans[0].chain.find(step => step.op === '_subchain_begin')
    assert.equal(begin.args.id, 'b')
    const reports = findDiagnostics(result, 'P009')
    assert.equal(reports.length, 1)
    assert.match(reports[0].message, /id/)
})

test('default parse reports a missing separator between keyword arguments but still parses', () => {
    const source = subchainSource('name: "a" id: "b"')
    const result = compile(source)
    const begin = result.plans[0].chain.find(step => step.op === '_subchain_begin')
    assert.deepEqual(begin.args, { name: 'a', id: 'b' })
    const reports = findDiagnostics(result, 'P010')
    assert.equal(reports.length, 1)
    const at = locationOf(source, 'id')
    assert.deepEqual(reports[0].location, { line: at.line, column: at.column })
})

test('co-occurring violations are reported once each in source order', () => {
    const source = subchainSource('nme: "x", name: "a" name: "b"')
    const result = compile(source)
    // Reports attach to the offending token. The missing separator report
    // precedes the duplicate report when both land on the same key token:
    // the missing comma belongs to the gap before the key.
    assert.deepEqual(result.diagnostics.map(d => d.code), ['P008', 'P010', 'P009'])
})

test('valid subchain argument forms produce no subchain diagnostics', () => {
    for (const args of ['name: "a"', 'name: "a", id: "b"', 'id: "b"', '"positional"', '']) {
        const result = compile(subchainSource(args))
        assert.deepEqual(result.diagnostics, [], `unexpected diagnostics for subchain(${args})`)
    }
})

test('subchain-in-subchain syntax keeps its legacy rejection (no nesting is parseable)', () => {
    const source = `${SUB}subchainProbe()\n  .subchain(name: "outer") {\n    .subchain(name: "inner") {\n      .subchainFilter()\n    }\n  }\n  .write(o0)`
    assert.throws(() => compile(source), (error) => {
        assert.equal(error.constructor, SyntaxError)
        assert.equal(error.diagnostic.code, 'P001')
        return true
    })
})

test('the public AST shape is unchanged; reports ride on non-enumerable metadata', () => {
    const ast = parse(lex(subchainSource('nme: "typo", name: "ok"')))
    const subchain = ast.plans[0].chain.find(node => node.type === 'Subchain')
    assert.deepEqual(Object.keys(subchain), ['type', 'name', 'id', 'body', 'loc'])
    assert.deepEqual(JSON.parse(JSON.stringify(subchain)), {
        type: 'Subchain', name: 'ok', id: null,
        body: JSON.parse(JSON.stringify(subchain.body)),
        loc: { line: subchain.loc.line, col: subchain.loc.col }
    })
})

test('legacy P006 message for a non-string subchain value is byte-identical', () => {
    const source = subchainSource('name: o0')
    assert.throws(() => compile(source), (error) => {
        assert.equal(error.constructor, SyntaxError)
        assert.equal(error.message, 'Expected string value for subchain name at line 3 col 19')
        assert.equal(error.diagnostic.code, 'P006')
        assert.equal(error.diagnostic.severity, 'error')
        return true
    })
})

test('mixing a positional name with keyword arguments keeps its legacy rejection', () => {
    assert.throws(() => compile(subchainSource('"a", id: "b"')), (error) => {
        assert.equal(error.constructor, SyntaxError)
        assert.equal(error.diagnostic.code, 'P002')
        return true
    })
})

test('comments, CRLF, and nested whitespace do not produce spurious subchain reports', () => {
    const source = `search synth\r\nnoise(10)\r\n  // lead\r\n  .subchain(name: "a", id: "b") {\r\n    // inner\r\n    .bloom()\r\n  }\r\n  .write(o0)`
    const result = compile(source)
    assert.equal(findDiagnostics(result, 'P008').length, 0)
    assert.equal(findDiagnostics(result, 'P009').length, 0)
    assert.equal(findDiagnostics(result, 'P010').length, 0)
})

test('strict parse rejects an unknown subchain key with source span', () => {
    const source = subchainSource('nme: "typo", name: "ok"')
    assert.throws(() => parse(lex(source), { subchainArguments: 'strict' }), (error) => {
        assert.equal(error.constructor, SyntaxError)
        assert.match(error.message, /nme/)
        assert.equal(error.diagnostic.code, 'P008')
        assert.equal(error.diagnostic.stage, 'parser')
        assert.equal(error.diagnostic.severity, 'error')
        const at = locationOf(source, 'nme')
        assert.deepEqual(error.diagnostic.location, { line: at.line, column: at.column })
        assert.deepEqual(error.diagnostic.span, { start: at.start, end: at.end })
        return true
    })
})

test('strict parse rejects duplicate keys with the offending occurrence location', () => {
    const source = subchainSource('name: "a", name: "b"')
    assert.throws(() => parse(lex(source), { subchainArguments: 'strict' }), (error) => {
        assert.equal(error.diagnostic.code, 'P009')
        const at = locationOf(source, 'name', 1)
        assert.deepEqual(error.diagnostic.location, { line: at.line, column: at.column })
        return true
    })
})

test('strict parse rejects a missing separator', () => {
    const source = subchainSource('name: "a" id: "b"')
    assert.throws(() => parse(lex(source), { subchainArguments: 'strict' }), (error) => {
        assert.equal(error.diagnostic.code, 'P010')
        return true
    })
})

test('strict compile accepts the same valid forms as the default path', () => {
    for (const args of ['name: "a"', 'name: "a", id: "b"', '"positional"', '']) {
        const strict = compile(subchainSource(args), { subchainArguments: 'strict' })
        const loose = compile(subchainSource(args))
        assert.deepEqual(JSON.parse(JSON.stringify(strict.plans)), JSON.parse(JSON.stringify(loose.plans)))
    }
})

test('strict compile rejects an unknown key through the public entry point', () => {
    assert.throws(() => compile(subchainSource('nme: "typo"'), { subchainArguments: 'strict' }), (error) => {
        assert.equal(error.diagnostic.code, 'P008')
        return true
    })
})

test('validate surfaces parser-attached subchain reports for caller-supplied ASTs', () => {
    const ast = parse(lex(subchainSource('nme: "typo", name: "ok"')))
    const result = validate(ast)
    assert.equal(findDiagnostics(result, 'P008').length, 1)
})

test('repeated unknown keys report P008 once per occurrence and never P009', () => {
    const source = subchainSource('nme: "x", nme: "y", name: "ok"')
    const result = compile(source)
    assert.deepEqual(findDiagnostics(result, 'P008').length, 2)
    assert.equal(findDiagnostics(result, 'P009').length, 0)
    const begin = result.plans[0].chain.find(step => step.op === '_subchain_begin')
    assert.deepEqual(begin.args, { name: 'ok', id: null })
})

test('subchain reports fall back to token line/col when tokens lack source positions', () => {
    // Caller-supplied tokens without `position` metadata keep their line/col
    // fallback; verify the report is still machine-readable.
    const tokens = lex(subchainSource('nme: "typo", name: "ok"')).map(({ position, ...rest }) => {
        void position
        return rest
    })
    const result = validate(parse(tokens))
    const report = findDiagnostics(result, 'P008')[0]
    assert.equal(report.code, 'P008')
    assert.equal(report.location.line, 3)
})

test('subchain reports carry no location when tokens lack all position data', () => {
    // Tokens without `position`, `line`, or `col`: the report is still
    // machine-readable but carries no location, per the "where available"
    // convention.
    const tokens = lex(subchainSource('nme: "typo", name: "ok"')).map(({ position, line, col, ...rest }) => {
        void position
        void line
        void col
        return rest
    })
    const result = validate(parse(tokens))
    const report = findDiagnostics(result, 'P008')[0]
    assert.equal(report.code, 'P008')
    assert.equal(Object.hasOwn(report, 'location'), false)
})
