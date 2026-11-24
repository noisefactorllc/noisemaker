// The gamut directive: a program on the 2.x line declares that its colors may
// leave sRGB. It is a header line after search and before the first
// statement, `gamut p3`, at most once, and the unparser writes it back on its
// own line after search.
import assert from 'node:assert/strict'
import test from 'node:test'
import { CanvasRenderer, compile, registerStarterOps, unparse } from '../src/index.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { mergeIntoEnums } from '../src/lang/enums.js'
import noise from '../effects/synth/noise/definition.js'
import bloom from '../effects/filter/bloom/definition.js'

const renderer = new CanvasRenderer()
for (const [namespace, name, instance] of [['synth', 'Noise', noise], ['filter', 'Bloom', bloom]]) {
    const choices = renderer.registerEffectWithRuntime({ namespace, name, instance })
    if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices)
}
registerStarterOps(['synth.noise'])

const errors = c => c.diagnostics.filter(d => d.severity === 'error')

function parseError(src) {
    try {
        compile(src)
    } catch (error) {
        return error
    }
    assert.fail(`expected a parse error for:\n${src}`)
}

// The language reference's example.
const EXAMPLE = 'search synth, filter\ngamut p3\n\nnoise(scaleX: 4)\n  .bloom()\n  .write(o0)\n\nrender(o0)'

test('a program with gamut p3 compiles with its gamut, and one without has none', () => {
    const declared = compile(EXAMPLE)
    assert.deepEqual(errors(declared), [])
    assert.equal(declared.gamut, 'p3')
    const plain = compile(EXAMPLE.replace('gamut p3\n', ''))
    assert.deepEqual(errors(plain), [])
    assert.equal('gamut' in plain, false)
})

test('the directive may sit before or after the seed directive', () => {
    for (const src of ['search synth\ngamut p3\nseed 7\nnoise().write(o0)', 'search synth\nseed 7\ngamut p3\nnoise().write(o0)']) {
        const c = compile(src)
        assert.deepEqual(errors(c), [], src)
        assert.equal(c.gamut, 'p3', src)
        assert.equal(c.seed, 7, src)
    }
})

test('a second directive, a misplaced one or another value is a P012 error with a location', () => {
    for (const [src, message] of [
        ['search synth\ngamut p3\ngamut p3\nnoise().write(o0)', /Only one gamut directive/],
        ['search synth\nnoise().write(o0)\ngamut p3', /must appear before other statements/],
        ['gamut p3\nsearch synth\nnoise().write(o0)', /must follow the search directive/],
        ['search synth\ngamut rec2020\nnoise().write(o0)', /The gamut must be p3/],
        ['search synth\ngamut\nnoise().write(o0)', /The gamut must be p3/],
    ]) {
        const error = parseError(src)
        assert.equal(error.diagnostic?.code, 'P012', src)
        assert.match(error.message, message, src)
        assert.match(error.message, /at line \d+ col \d+/, src)
    }
    // The location is the offending token's: the second directive, and the value that is not p3.
    assert.deepEqual(parseError('search synth\ngamut p3\ngamut p3\nnoise().write(o0)').diagnostic.location, { line: 3, column: 1 })
    assert.deepEqual(parseError('search synth\ngamut rec2020\nnoise().write(o0)').diagnostic.location, { line: 2, column: 7 })
    // A part declaration is a statement, so a directive after it is misplaced.
    const afterPart = parseError('search synth\npart edge {\n  .bloom()\n}\ngamut p3\nnoise().write(o0)')
    assert.equal(afterPart.diagnostic?.code, 'P012')
    assert.match(afterPart.message, /must appear before other statements/)
})

test('gamut stays an ordinary name where a statement or a value can begin, and a comment may precede the directive', () => {
    const named = compile('search synth\nlet gamut = 4\nnoise(scaleX: gamut).write(o0)')
    assert.deepEqual(errors(named), [])
    assert.equal('gamut' in named, false)
    const commented = compile('search synth\n// the colors may leave sRGB\ngamut p3\nnoise().write(o0)')
    assert.deepEqual(errors(commented), [])
    assert.equal(commented.gamut, 'p3')
})

test('a call or a chain named gamut is not the directive', () => {
    // Only `gamut` followed by a value starts the directive; `gamut(` is a call, which the validator reports.
    const call = compile('search synth\ngamut().write(o0)')
    assert.equal('gamut' in call, false)
    assert.ok(call.diagnostics.length > 0)
    assert.equal(call.diagnostics.some(d => d.code === 'P012'), false)
})

test('the unparser writes the directive on its own line after search, before seed, and the text survives a round trip', () => {
    assert.match(unparse(compile(EXAMPLE)), /^search synth, filter\ngamut p3\n\n/)
    assert.match(unparse(compile('search synth\nseed 7\ngamut p3\nnoise().write(o0)')), /^search synth\ngamut p3\nseed 7\n\n/)
    for (const src of [EXAMPLE, 'search synth\ngamut p3\nseed 7\n\nnoise(scaleX: 4)\n  .write(o0)\n\nrender(o0)']) {
        const once = unparse(compile(src))
        const again = unparse(compile(once))
        assert.equal(again, once, src)
        assert.equal(compile(once).gamut, 'p3')
    }
    assert.doesNotMatch(unparse(compile(EXAMPLE.replace('gamut p3\n', ''))), /gamut/)
})

test('the compiled graph carries the gamut for the present step', () => {
    assert.equal(compileGraph(EXAMPLE).gamut, 'p3')
    assert.equal(compileGraph(EXAMPLE.replace('gamut p3\n', '')).gamut, null)
})
