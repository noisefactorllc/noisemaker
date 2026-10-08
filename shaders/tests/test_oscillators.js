/**
 * Tests for Oscillator support in the Polymorphic DSL
 *
 * Oscillators are time-varying values that can be used as inputs for effect parameters.
 * They generate looping values synchronized with the animation duration.
 */

import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { registerStarterOps } from '../src/lang/validator.js'
import { compile, unparse } from '../src/lang/index.js'
import { formatValue } from '../src/lang/unparser.js'
import { registerOp } from '../src/lang/ops.js'
import { Pipeline } from '../src/runtime/pipeline.js'

// Register test ops
registerOp('synth.noise', {
    name: 'noise',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'octaves', type: 'int', default: 1 },
        { name: 'rotation', type: 'float', default: 0 }
    ]
})

registerOp('filter.bloom', {
    name: 'bloom',
    args: [
        { name: 'amount', type: 'float', default: 0.5 }
    ]
})

registerStarterOps(['synth.noise'])

let passCount = 0
let failCount = 0

function test(name, fn) {
    try {
        console.log(`Running test: ${name}`)
        fn()
        console.log(`PASS: ${name}`)
        passCount++
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e.message)
        failCount++
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed')
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

// ============================================================================
// Parser Tests
// ============================================================================

test('Parser: Basic oscillator with type only', () => {
    const tokens = lex('search synth, filter\nnoise(scale: osc(type: oscKind.sine)).write(o0)')
    const ast = parse(tokens)

    // Find the oscillator in the call args
    const noiseCall = ast.plans[0].chain[0]
    assert(noiseCall.name === 'noise', 'Expected noise call')
    assert(noiseCall.kwargs, 'Expected kwargs')

    const scaleArg = noiseCall.kwargs.scale
    assert(scaleArg, 'Expected scale kwarg')
    assert(scaleArg.type === 'Oscillator', `Expected Oscillator type, got ${scaleArg.type}`)
    assert(scaleArg.oscType.type === 'Member', 'Expected oscType to be Member')
    assert(scaleArg.oscType.path.join('.') === 'oscKind.sine', 'Expected oscKind.sine')
})

test('Parser: Oscillator with all parameters', () => {
    const code = 'search synth, filter\nnoise(scale: osc(type: oscKind.tri, min: 0.2, max: 0.8, speed: 2, offset: 0.25, seed: 42)).write(o0)'
    const tokens = lex(code)
    const ast = parse(tokens)

    const scaleArg = ast.plans[0].chain[0].kwargs.scale
    assert(scaleArg.type === 'Oscillator', 'Expected Oscillator type')
    assertEqual(scaleArg.min.value, 0.2, 'Expected min 0.2')
    assertEqual(scaleArg.max.value, 0.8, 'Expected max 0.8')
    assertEqual(scaleArg.speed.value, 2, 'Expected speed 2')
    assertEqual(scaleArg.offset.value, 0.25, 'Expected offset 0.25')
    assertEqual(scaleArg.seed.value, 42, 'Expected seed 42')
})

test('Parser: Oscillator with positional arguments', () => {
    const code = 'search synth, filter\nnoise(scale: osc(oscKind.saw, 0.1, 0.5)).write(o0)'
    const tokens = lex(code)
    const ast = parse(tokens)

    const scaleArg = ast.plans[0].chain[0].kwargs.scale
    assert(scaleArg.type === 'Oscillator', 'Expected Oscillator type')
    assert(scaleArg.oscType.path.join('.') === 'oscKind.saw', 'Expected oscKind.saw')
    assertEqual(scaleArg.min.value, 0.1, 'Expected min 0.1')
    assertEqual(scaleArg.max.value, 0.5, 'Expected max 0.5')
})

test('Parser: Oscillator stored in variable', () => {
    const code = 'search synth, filter\nlet myOsc = osc(type: oscKind.sine, min: 0, max: 1)\nnoise(scale: myOsc).write(o0)'
    const tokens = lex(code)
    const ast = parse(tokens)

    // Check variable assignment
    assert(ast.vars.length === 1, 'Expected 1 variable')
    const varExpr = ast.vars[0].expr
    assert(varExpr.type === 'Oscillator', 'Expected Oscillator type in variable')
})

// ============================================================================
// Validator Tests
// ============================================================================

test('Validator: Oscillator resolves to oscillator config', () => {
    const result = compile('search synth, filter\nnoise(scale: osc(type: oscKind.sine, min: 0.2, max: 0.8)).write(o0)')

    // Find the compiled step
    const step = result.plans[0].chain[0]
    assert(step.args, 'Expected args')

    const scaleArg = step.args.scale
    assert(scaleArg, 'Expected scale arg')
    assert(scaleArg.type === 'Oscillator', 'Expected oscillator type')
    assertEqual(scaleArg.oscType, 0, 'Expected oscType 0 (sine)')
    assertEqual(scaleArg.min, 0.2, 'Expected min 0.2')
    assertEqual(scaleArg.max, 0.8, 'Expected max 0.8')
})

test('Validator: Different oscillator types resolve to correct values', () => {
    const types = [
        ['sine', 0],
        ['tri', 1],
        ['saw', 2],
        ['sawInv', 3],
        ['square', 4],
        ['noise', 5]
    ]

    for (const [typeName, expectedValue] of types) {
        const result = compile(`search synth, filter\nnoise(scale: osc(type: oscKind.${typeName})).write(o0)`)
        const scaleArg = result.plans[0].chain[0].args.scale
        assertEqual(scaleArg.oscType, expectedValue, `Expected oscType ${expectedValue} for ${typeName}`)
    }
})

test('Validator: Oscillator defaults are applied correctly', () => {
    const result = compile('search synth, filter\nnoise(scale: osc(type: oscKind.sine)).write(o0)')
    const scaleArg = result.plans[0].chain[0].args.scale

    assertEqual(scaleArg.min, 0, 'Expected default min 0')
    assertEqual(scaleArg.max, 1, 'Expected default max 1')
    assertEqual(scaleArg.speed, 1, 'Expected default speed 1')
    assertEqual(scaleArg.offset, 0, 'Expected default offset 0')
    assertEqual(scaleArg.seed, 1, 'Expected default seed 1')
})

test('Validator: Oscillator min/max are clamped to [0, 1]', () => {
    const result = compile('search synth, filter\nnoise(scale: osc(type: oscKind.sine, min: -0.5, max: 2)).write(o0)')
    const scaleArg = result.plans[0].chain[0].args.scale
    assertEqual(scaleArg.min, 0, 'min should be clamped to 0')
    assertEqual(scaleArg.max, 1, 'max should be clamped to 1')
})

test('Validator: Oscillator min/max within [0, 1] pass through unchanged', () => {
    const result = compile('search synth, filter\nnoise(scale: osc(type: oscKind.sine, min: 0.25, max: 0.75)).write(o0)')
    const scaleArg = result.plans[0].chain[0].args.scale
    assertEqual(scaleArg.min, 0.25, 'min should be 0.25')
    assertEqual(scaleArg.max, 0.75, 'max should be 0.75')
})

test('Validator: oscKind.noise2d resolves to kind 6 without diagnostics', () => {
    const result = compile('search synth, filter\nnoise(scale: osc(type: oscKind.noise2d, seed: 42)).write(o0)')
    assertEqual(result.diagnostics.length, 0, 'noise2d should not produce an S002 fallback')
    const scaleArg = result.plans[0].chain[0].args.scale
    assertEqual(scaleArg.oscType, 6, 'Expected oscType 6 (noise2d)')
    assertEqual(scaleArg.seed, 42, 'Expected seed 42')
})

test('Validator: numeric osc type 6 is accepted', () => {
    const result = compile('search synth, filter\nnoise(scale: osc(type: 6, seed: 7)).write(o0)')
    assertEqual(result.diagnostics.length, 0, 'numeric kind 6 should not produce diagnostics')
    assertEqual(result.plans[0].chain[0].args.scale.oscType, 6, 'Expected oscType 6')
})

// ============================================================================
// Unparser Tests (Round-trip)
// ============================================================================

test('Unparser: formatValue handles oscillator config', () => {
    const oscConfig = {
        type: 'Oscillator',
        oscType: 0,
        min: 0.2,
        max: 0.8,
        speed: 1,
        offset: 0,
        seed: 1
    }

    const formatted = formatValue(oscConfig)
    assert(formatted.includes('osc('), 'Expected osc( in output')
    assert(formatted.includes('oscKind.sine'), 'Expected oscKind.sine')
    assert(formatted.includes('min: 0.2'), 'Expected min: 0.2')
    assert(formatted.includes('max: 0.8'), 'Expected max: 0.8')
})

test('Unparser: formatValue omits default values', () => {
    const oscConfig = {
        type: 'Oscillator',
        oscType: 0,
        min: 0,
        max: 1,
        speed: 1,
        offset: 0,
        seed: 1
    }

    const formatted = formatValue(oscConfig)
    // Only type should be included since all others are default
    assert(!formatted.includes('min:'), 'Should not include default min')
    assert(!formatted.includes('max:'), 'Should not include default max')
    assert(!formatted.includes('speed:'), 'Should not include default speed')
    assert(!formatted.includes('offset:'), 'Should not include default offset')
})

test('Unparser: All oscillator types format correctly', () => {
    const types = ['sine', 'tri', 'saw', 'sawInv', 'square', 'noise']

    for (let i = 0; i < types.length; i++) {
        const oscConfig = {
            type: 'Oscillator',
            oscType: i,
            min: 0,
            max: 1,
            speed: 1,
            offset: 0,
            seed: 1
        }

        const formatted = formatValue(oscConfig)
        assert(formatted.includes(`oscKind.${types[i]}`), `Expected oscKind.${types[i]} in ${formatted}`)
    }
})

test('Unparser: round trip keeps oscKind.noise2d', () => {
    const source = `search synth, filter
noise(scale: osc(type: oscKind.noise2d, min: 0.2, max: 0.8, seed: 42)).write(o0)`
    const compiled = compile(source)
    assertEqual(compiled.diagnostics.length, 0, 'compile should succeed')
    const unparsed = unparse(compiled)
    assert(unparsed.includes('oscKind.noise2d'), `Expected oscKind.noise2d in ${unparsed}`)
    const recompiled = compile(unparsed)
    assertEqual(recompiled.diagnostics.length, 0, 'recompile should succeed')
    assertEqual(recompiled.plans[0].chain[0].args.scale.oscType, 6, 'oscType survives the round trip')
})

// Unparse one osc() type spelling inline and through a let, recompile, and
// return each form's osc() line with the kinds and seeds on both sides.
function roundTripOscType(typeSource) {
    const forms = {
        inline: `search synth, filter\nnoise(scale: osc(type: ${typeSource}, speed: 2, seed: 42)).write(o0)`,
        let: `search synth, filter\nlet o = osc(type: ${typeSource}, speed: 2, seed: 42)\nnoise(scale: o).write(o0)`
    }
    return Object.entries(forms).map(([form, source]) => {
        const compiled = compile(source)
        const unparsed = unparse(compiled)
        const recompiled = compile(unparsed)
        const before = compiled.plans[0].chain[0].args.scale
        const after = recompiled.plans[0].chain[0].args.scale
        return {
            form,
            diagnostics: compiled.diagnostics.length,
            recompileDiagnostics: recompiled.diagnostics.length,
            line: unparsed.split('\n').find((l) => l.includes('osc(')).trim(),
            kind: before.oscType,
            seed: before.seed,
            recompiledKind: after.oscType,
            recompiledSeed: after.seed
        }
    })
}

test('Unparser: numeric type 6 round-trips as oscKind.noise2d', () => {
    for (const r of roundTripOscType('6')) {
        assertEqual(r.diagnostics, 0, `${r.form}: type 6 compiles without diagnostics`)
        assertEqual(r.kind, 6, `${r.form}: type 6 compiles to kind 6`)
        assert(r.line.includes('osc(type: oscKind.noise2d, speed: 2, seed: 42)'),
            `${r.form}: expected oscKind.noise2d in ${r.line}`)
        assertEqual(r.recompileDiagnostics, 0, `${r.form}: unparsed type 6 recompiles without diagnostics`)
        assertEqual(r.recompiledKind, 6, `${r.form}: type 6 survives the round trip`)
        assertEqual(r.recompiledSeed, 42, `${r.form}: seed survives the round trip`)
    }
})

test('Unparser: oscKind.noise2d round-trips with its speed and seed', () => {
    for (const r of roundTripOscType('oscKind.noise2d')) {
        assert(r.line.includes('osc(type: oscKind.noise2d, speed: 2, seed: 42)'),
            `${r.form}: expected oscKind.noise2d with speed and seed in ${r.line}`)
        assertEqual(r.recompileDiagnostics, 0, `${r.form}: recompiles without diagnostics`)
        assertEqual(r.recompiledKind, 6, `${r.form}: kind survives the round trip`)
        assertEqual(r.recompiledSeed, 42, `${r.form}: seed survives the round trip`)
    }
})

test('Unparser: noise2d config without an AST keeps its seed', () => {
    const formatted = formatValue({ type: 'Oscillator', oscType: 6, min: 0, max: 1, speed: 2, offset: 0, seed: 42 })
    assertEqual(formatted, 'osc(type: oscKind.noise2d, speed: 2, seed: 42)', 'noise2d config output')
    const recompiled = compile(`search synth, filter\nnoise(scale: ${formatted}).write(o0)`)
    assertEqual(recompiled.diagnostics.length, 0, 'formatted noise2d recompiles without diagnostics')
    assertEqual(recompiled.plans[0].chain[0].args.scale.oscType, 6, 'kind survives the round trip')
    assertEqual(recompiled.plans[0].chain[0].args.scale.seed, 42, 'seed survives the round trip')
})

test('Unparser: every type spelling the validator accepts round-trips', () => {
    const spellings = [
        '0', '1', '2', '3', '4', '5', '6',
        'oscKind.sine', 'oscKind.tri', 'oscKind.saw', 'oscKind.sawInv', 'oscKind.square',
        'oscKind.noise', 'oscKind.noise1d', 'oscKind.noise2d',
        'oscType.sine', 'oscType.linear', 'oscType.sawtooth', 'oscType.sawtoothInv',
        'oscType.square', 'oscType.noise1d', 'oscType.noise2d',
        'sine', 'tri', 'saw', 'sawInv', 'square', 'noise', 'noise1d', 'noise2d'
    ]
    for (const spelling of spellings) {
        for (const r of roundTripOscType(spelling)) {
            assertEqual(r.diagnostics, 0, `${r.form} ${spelling}: the validator accepts it`)
            assertEqual(r.recompileDiagnostics, 0, `${r.form} ${spelling}: unparsed as ${r.line}, recompiles without diagnostics`)
            assertEqual(r.recompiledKind, r.kind, `${r.form} ${spelling}: unparsed as ${r.line}, kind survives`)
            assertEqual(r.recompiledSeed, r.seed, `${r.form} ${spelling}: unparsed as ${r.line}, seed survives`)
        }
    }
})

// Unparse output for kinds 0-5, recorded before kind 6 joined the numeric
// mapping. These strings must not change.
test('Unparser: kinds 0-5 keep their unparse output byte for byte', () => {
    const pinned = {
        '0': 'oscKind.sine', '1': 'oscKind.tri', '2': 'oscKind.saw', '3': 'oscKind.sawInv',
        '4': 'oscKind.square', '5': 'oscKind.noise1d',
        'oscKind.sine': 'oscKind.sine', 'oscKind.tri': 'oscKind.tri', 'oscKind.saw': 'oscKind.saw',
        'oscKind.sawInv': 'oscKind.sawInv', 'oscKind.square': 'oscKind.square',
        'oscKind.noise': 'oscKind.noise', 'oscKind.noise1d': 'oscKind.noise1d',
        'oscType.sine': 'oscKind.sine', 'oscType.square': 'oscKind.square', 'oscType.noise1d': 'oscKind.noise1d',
        'sine': 'sine', 'tri': 'tri'
    }
    for (const [spelling, typeText] of Object.entries(pinned)) {
        const [inline, viaLet] = roundTripOscType(spelling)
        assertEqual(inline.line, `noise(scale: osc(type: ${typeText}, speed: 2, seed: 42))`, `inline ${spelling}`)
        assertEqual(viaLet.line, `let o = osc(type: ${typeText}, speed: 2, seed: 42)`, `let ${spelling}`)
    }
    const names = ['sine', 'tri', 'saw', 'sawInv', 'square', 'noise1d']
    for (let kind = 0; kind <= 5; kind++) {
        for (const seed of [1, 42]) {
            const seedText = kind === 5 && seed !== 1 ? `, seed: ${seed}` : ''
            assertEqual(
                formatValue({ type: 'Oscillator', oscType: kind, min: 0, max: 1, speed: 2, offset: 0, seed }),
                `osc(type: oscKind.${names[kind]}, speed: 2${seedText})`,
                `config kind ${kind} seed ${seed}`)
        }
    }
})

// ============================================================================
// Runtime Tests (evaluateOscillator via Pipeline)
// ============================================================================

function assertApprox(actual, expected, tolerance, message) {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message || 'Assertion failed'}: expected ${expected} +/- ${tolerance}, got ${actual}`)
    }
}

const pipeline = new Pipeline(null, null)

function sampleCurve(config, samples) {
    return samples.map((time) => pipeline.resolveUniformValue(config, time))
}

function compiledOsc(source) {
    const result = compile(source)
    assertEqual(result.diagnostics.length, 0, 'osc() should compile without diagnostics')
    return result.plans[0].chain[0].args.scale
}

// Pins the pre-existing oscillator kinds so the noise2d work cannot drift them.
// Values recorded from the implementation before noise2d support was added.
const PIN_TIMES = [0, 0.25, 0.5, 0.75]
const PINS = [
    { seed: 7, kind: 0, values: [0, 0.5, 1, 0.5] },
    { seed: 7, kind: 1, values: [0, 0.5, 1, 0.5] },
    { seed: 7, kind: 2, values: [0, 0.25, 0.5, 0.75] },
    { seed: 7, kind: 3, values: [1, 0.75, 0.5, 0.25] },
    { seed: 7, kind: 4, values: [0, 0, 1, 1] },
    { seed: 7, kind: 5, values: [0.378248872499931, 0.7515301125166395, 0.269999372498686, 0.549302812511977] },
    { seed: 42, kind: 5, values: [0.06935776014230743, 0.5376382001337624, 0.40049026022115086, 0.6929954000587877] }
]

test('Runtime: kinds 0-5 keep their pinned outputs', () => {
    for (const { seed, kind, values } of PINS) {
        const config = { type: 'Oscillator', oscType: kind, min: 0, max: 1, speed: 1, offset: 0, seed }
        const actual = sampleCurve(config, PIN_TIMES)
        for (let i = 0; i < values.length; i++) {
            assertApprox(actual[i], values[i], 1e-9, `kind ${kind} seed ${seed} at t=${PIN_TIMES[i]}`)
        }
    }
})

test('Runtime: noise2d stays in 0..1 and is deterministic', () => {
    const config = compiledOsc(`search synth, filter
noise(scale: osc(type: oscKind.noise2d, speed: 2, seed: 42)).write(o0)`)
    const times = []
    for (let i = 0; i <= 64; i++) times.push(i / 64)
    for (const seed of [7, 42, 123]) for (const speed of [1, 2, 3]) {
        const probe = { ...config, seed, speed }
        const curve = sampleCurve(probe, times)
        for (let i = 0; i < curve.length; i++) {
            assert(curve[i] >= 0 && curve[i] <= 1, `noise2d out of range at t=${times[i]} (seed ${seed}, speed ${speed}): ${curve[i]}`)
        }
        const again = sampleCurve(probe, times)
        for (let i = 0; i < curve.length; i++) {
            assertEqual(again[i], curve[i], `noise2d must be deterministic (seed ${seed}, speed ${speed})`)
        }
    }
})

test('Runtime: noise2d differs from sine and noise1d', () => {
    const times = []
    for (let i = 0; i <= 32; i++) times.push(i / 32)
    const noise2d = sampleCurve({ type: 'Oscillator', oscType: 6, min: 0, max: 1, speed: 1, offset: 0, seed: 42 }, times)
    const sine = sampleCurve({ type: 'Oscillator', oscType: 0, min: 0, max: 1, speed: 1, offset: 0, seed: 42 }, times)
    const noise1d = sampleCurve({ type: 'Oscillator', oscType: 5, min: 0, max: 1, speed: 1, offset: 0, seed: 42 }, times)
    const maxDiff = (a, b) => Math.max(...times.map((_, i) => Math.abs(a[i] - b[i])))
    assert(maxDiff(noise2d, sine) > 0.01, 'noise2d should not animate as a sine')
    assert(maxDiff(noise2d, noise1d) > 0.01, 'noise2d should differ from noise1d')
})

test('Runtime: noise2d varies with seed', () => {
    const times = []
    for (let i = 0; i <= 32; i++) times.push(i / 32)
    const curveA = sampleCurve({ type: 'Oscillator', oscType: 6, min: 0, max: 1, speed: 1, offset: 0, seed: 42 }, times)
    const curveB = sampleCurve({ type: 'Oscillator', oscType: 6, min: 0, max: 1, speed: 1, offset: 0, seed: 7 }, times)
    const maxDiff = Math.max(...times.map((_, i) => Math.abs(curveA[i] - curveB[i])))
    assert(maxDiff > 0.01, 'a different seed should give a different curve')
})

test('Runtime: noise2d loops seamlessly at whole-number speeds', () => {
    for (const speed of [1, 2, 3]) for (const offset of [0, 0.25]) for (const seed of [7, 42]) {
        const config = { type: 'Oscillator', oscType: 6, min: 0, max: 1, speed, offset, seed }
        const start = pipeline.resolveUniformValue(config, 0)
        const end = pipeline.resolveUniformValue(config, 1)
        assertApprox(end, start, 1e-9, `loop at speed ${speed}, offset ${offset}, seed ${seed}`)
    }
})

test('Runtime: noise2d matches the osc2d reference formula at non-unit speeds', () => {
    // Independent re-implementation of the osc2d effect's formula, including
    // the runtime's fixed seed-derived sampling position, so the expected
    // values pin that speed is applied exactly once (after the first
    // periodic wrap), not again on top of the phase.
    const TAU = Math.PI * 2
    const periodicValue = (x, v) => (Math.sin((x - v) * TAU) + 1) * 0.5
    const hash21 = (px, py, s) => {
        let x = (px * 234.34 + s) % 1
        let y = (py * 435.345 + s) % 1
        if (x < 0) x += 1
        if (y < 0) y += 1
        const p = x + y + (x + y) * 34.23
        return (x * y * p) % 1
    }
    const noise2D = (px, py, s) => {
        const ix = Math.floor(px)
        const iy = Math.floor(py)
        let fx = px - ix
        let fy = py - iy
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        const a = hash21(ix, iy, s)
        const b = hash21(ix + 1, iy, s)
        const c = hash21(ix, iy + 1, s)
        const d = hash21(ix + 1, iy + 1, s)
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
    }
    for (const [seed, speed] of [[42, 2], [7, 3.5], [123, 1]]) {
        const px = (Math.abs(seed % 16) + 0.5) / 16
        const py = (Math.abs(Math.floor(seed / 16) % 16) + 0.5) / 16
        const timeNoise = noise2D(px, py, seed + 12345)
        const valueNoise = noise2D(px, py, seed)
        const config = { type: 'Oscillator', oscType: 6, min: 0, max: 1, speed, offset: 0.25, seed }
        for (const normalizedTime of [0, 0.3, 0.5, 0.77, 1]) {
            const expected = periodicValue(
                periodicValue(normalizedTime + 0.25, timeNoise) * speed, valueNoise)
            const actual = pipeline.resolveUniformValue(config, normalizedTime)
            assertApprox(actual, expected, 1e-12, `noise2d speed ${speed} seed ${seed} at t=${normalizedTime}`)
        }
    }
})

// ============================================================================
// Integration Tests
// ============================================================================

test('Integration: Full compile and unparse round-trip', () => {
    const original = 'search synth, filter\nnoise(scale: osc(type: oscKind.sine, min: 0.2, max: 0.8)).write(o0)'
    const compiled = compile(original)

    // Verify compilation produced oscillator config
    const scaleArg = compiled.plans[0].chain[0].args.scale
    assert(scaleArg.type === 'Oscillator', 'Expected oscillator in compiled output')

    // The unparser should be able to format this back
    // Note: We can't do exact string comparison because the unparser may reorder/format differently
})

test('Integration: Oscillator in complex chain', () => {
    const code = `search synth, filter
let scaleOsc = osc(type: oscKind.saw, min: 0.1, max: 1, speed: 2)
noise(scale: scaleOsc).bloom(amount: 0.5).write(o0)`

    const compiled = compile(code)
    assert(compiled.plans.length === 1, 'Expected 1 plan')

    // First step should have oscillator
    const noiseStep = compiled.plans[0].chain[0]
    assert(noiseStep.args.scale.type === 'Oscillator', 'Expected oscillator in noise scale')
    assertEqual(noiseStep.args.scale.oscType, 2, 'Expected saw type (2)')
    assertEqual(noiseStep.args.scale.speed, 2, 'Expected speed 2')
})

// ============================================================================
// Summary
// ============================================================================

console.log('\n========================================')
console.log(`Oscillator Tests Complete`)
console.log(`Passed: ${passCount}`)
console.log(`Failed: ${failCount}`)
console.log('========================================')

if (failCount > 0) {
    process.exit(1)
}
