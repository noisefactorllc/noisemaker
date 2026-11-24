import assert from 'node:assert/strict'
import test from 'node:test'
import { CanvasRenderer, compile, registerStarterOps, unparse } from '../src/index.js'
import { mergeIntoEnums } from '../src/lang/enums.js'
import { drawU32, randFrom, randIntFrom } from '../src/lang/draws.js'
import { validateEffectDefinition } from '../src/runtime/effect-validator.js'
import { compileGraph } from '../src/runtime/compiler.js'
import noise from '../effects/synth/noise/definition.js'
import splat from '../effects/classicNoisedeck/splat/definition.js'
import life from '../effects/points/life/definition.js'

const renderer = new CanvasRenderer()
for (const [namespace, name, instance] of [['synth', 'Noise', noise], ['classicNoisedeck', 'Splat', splat], ['points', 'Life', life]]) {
    const choices = renderer.registerEffectWithRuntime({ namespace, name, instance })
    if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices)
}
registerStarterOps(['synth.noise'])

const errors = c => c.diagnostics.filter(d => d.severity === 'error')
const codes = c => c.diagnostics.map(d => d.code)
const step = (c, plan = 0, index = 0) => c.plans[plan].chain[index]
const seedRange = [noise.globals.seed.min, noise.globals.seed.max]

test('with a seed directive, an unseeded effect inherits a seed drawn over its range', () => {
    const c = compile('search synth\nseed 7\nnoise().write(o0)\nnoise().write(o1)')
    assert.deepEqual(errors(c), [])
    assert.equal(step(c, 0).args.seed, randIntFrom(drawU32(7, 'synth.noise@noise_1/seed/inherit'), ...seedRange))
    assert.equal(step(c, 1).args.seed, randIntFrom(drawU32(7, 'synth.noise@noise_2/seed/inherit'), ...seedRange))
    assert.deepEqual(step(c, 0).inheritedSeeds, { seed: true })
})

test('an inherited seed is never written into the source', () => {
    const src = 'search synth\nseed 7\n\nnoise()\n  .write(o0)'
    const c = compile(src)
    assert.equal(unparse(c), src)
    assert.deepEqual(compile(unparse(c)).plans, c.plans)
})

test('without a seed directive, effect seeds keep their defaults', () => {
    const c = compile('search synth\nnoise().write(o0)')
    assert.equal(step(c).args.seed, noise.globals.seed.default)
    assert.equal(step(c).inheritedSeeds, undefined)
})

test('an explicit seed always wins and is kept in the source', () => {
    const c = compile('search synth\nseed 7\nnoise(seed: 1).write(o0)')
    assert.equal(step(c).args.seed, 1)
    assert.equal(step(c).inheritedSeeds, undefined)
    assert.match(unparse(c), /seed: 1/)
})

test('an oscillator seed does not inherit', () => {
    const c = compile('search synth\nseed 7\nnoise(scaleX: osc(type: oscKind.noise)).write(o0)')
    assert.deepEqual(errors(c), [])
    assert.equal(step(c).args.scaleX.seed, 1)
})

test('parameters marked inheritsSeed inherit over their whole-number range', () => {
    assert.equal(life.globals.matrixSeed.inheritsSeed, true)
    assert.equal(splat.globals.speckSeed.inheritsSeed, true)
    const c = compile('search synth, classicNoisedeck\nseed 3\nnoise().splat().write(o0)')
    const splatStep = c.plans[0].chain.find(s => s.op === 'classicNoisedeck.splat')
    assert.ok(splatStep, JSON.stringify(c.diagnostics))
    const { min, max } = splat.globals.speckSeed
    assert.equal(splatStep.args.speckSeed, randIntFrom(drawU32(3, 'classicNoisedeck.splat@splat_1/speckSeed/inherit'), min, max))
    assert.equal(splatStep.inheritedSeeds.speckSeed, true)
})

test('the definition schema accepts inheritsSeed: true and nothing else', () => {
    const base = { name: 'Probe', namespace: 'synth', func: 'probe', passes: [] }
    const withField = value => ({ ...base, globals: { s: { type: 'int', default: 1, min: 1, max: 9, uniform: 's', inheritsSeed: value } } })
    const message = value => validateEffectDefinition(withField(value)).join('\n')
    assert.doesNotMatch(message(true), /inheritsSeed/)
    assert.match(message(false), /inheritsSeed/)
})

test('_seed gives an element its own seed, with keys that restart at the element', () => {
    const c = compile('search synth\nnoise(_seed: 5, scaleY: rand(1, 10)).write(o0)')
    assert.deepEqual(errors(c), [])
    assert.equal(step(c).args.scaleY, randFrom(drawU32(5, 'synth.noise/scaleY'), 1, 10))
    assert.equal(step(c).args.seed, randIntFrom(drawU32(5, 'synth.noise/seed/inherit'), ...seedRange), 'inherits inside its scope without a seed directive')
})

test('a _seed variation is the same wherever it stands and whatever the program seed', () => {
    const a = compile('search synth\nnoise(_seed: 5, scaleY: rand(1, 10)).write(o0)')
    const b = compile(`search synth
seed 99
noise(scaleY: rand(1, 10)).write(o1)
if (chance(1)) {
    noise(_seed: 5, scaleY: rand(1, 10)).write(o0)
}`)
    assert.deepEqual(errors(b), [])
    const inner = b.plans[1].then[0].chain[0]
    assert.equal(inner.args.scaleY, step(a).args.scaleY)
    assert.equal(inner.args.seed, step(a).args.seed)
})

test('_seed round-trips and must be a literal whole number', () => {
    const c = compile('search synth\nnoise(_seed: 5, scaleY: rand(1, 10)).write(o0)')
    const once = unparse(c)
    assert.match(once, /_seed: 5/)
    assert.deepEqual(step(compile(once)).args, step(c).args)
    assert.equal(unparse(compile(once)), once)
    assert.ok(codes(compile('search synth\nnoise(_seed: randInt(1, 2)).write(o0)')).includes('S013'))
    assert.ok(codes(compile('search synth\nnoise(_seed: 1.5).write(o0)')).includes('S012'))
    assert.ok(codes(compile('search synth\nnoise(_seed: 4294967296).write(o0)')).includes('S012'))
})

test('the expanded graph carries no _seed uniform', () => {
    const graph = compileGraph('search synth\nnoise(_seed: 5).write(o0)\nrender(o0)')
    assert.ok(graph.passes.length > 0)
    for (const pass of graph.passes) assert.ok(!('_seed' in (pass.uniforms || {})), JSON.stringify(pass.uniforms))
})
