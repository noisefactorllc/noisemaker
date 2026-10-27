import assert from 'node:assert/strict'
import test from 'node:test'

import { compile, lex } from '../src/lang/index.js'

test('public compiler rejects output surfaces outside o0-o7 in every DSL position', async (t) => {
    const cases = [
        {
            name: 'render target',
            source: 'search synth\nrender(o8)',
            expected: /^Output surface reference 'o8' is out of range; expected o0-o7 at line 2 col 8$/
        },
        {
            name: 'read source',
            source: 'search synth\nread(o99).write(o0)',
            expected: /^Output surface reference 'o99' is out of range; expected o0-o7 at line 2 col 6$/
        },
        {
            name: 'write target',
            source: 'search synth\nread(o0).write(o10)',
            expected: /^Output surface reference 'o10' is out of range; expected o0-o7 at line 2 col 16$/
        }
    ]

    for (const { name, source, expected } of cases) {
        await t.test(name, () => {
            assert.throws(
                () => compile(source),
                (error) => error instanceof SyntaxError && expected.test(error.message)
            )
        })
    }
})

test('public compiler preserves o0 and o7 boundary behavior', () => {
    const compiled = compile('search synth\nread(o0).write(o7)\nrender(o7)')

    assert.deepEqual(compiled.plans[0].chain[0].args.tex, { kind: 'output', name: 'o0' })
    assert.deepEqual(compiled.plans[0].write, { kind: 'output', name: 'o7' })
    assert.equal(compiled.render, 'o7')
})

test('output-shaped member segments and other reference families keep their existing token behavior', () => {
    const compiled = compile(`search synth
let low = foo.o0
let high = foo.o7
let extended = foo.o8
let many = foo.o99`)

    assert.deepEqual(
        compiled.vars.map(({ expr }) => expr.path),
        [['foo', 'o0'], ['foo', 'o7'], ['foo', 'o8'], ['foo', 'o99']]
    )
    assert.deepEqual(
        lex('s99 vol99 geo99 xyz99 vel99 rgba99 mesh99').map(({ type, lexeme }) => ({ type, lexeme })),
        [
            { type: 'SOURCE_REF', lexeme: 's99' },
            { type: 'VOL_REF', lexeme: 'vol99' },
            { type: 'GEO_REF', lexeme: 'geo99' },
            { type: 'XYZ_REF', lexeme: 'xyz99' },
            { type: 'VEL_REF', lexeme: 'vel99' },
            { type: 'RGBA_REF', lexeme: 'rgba99' },
            { type: 'MESH_REF', lexeme: 'mesh99' },
            { type: 'EOF', lexeme: '' }
        ]
    )
})
