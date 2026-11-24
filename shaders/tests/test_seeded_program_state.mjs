import assert from 'node:assert/strict'
import test from 'node:test'
import { CanvasRenderer, compile, registerStarterOps } from '../src/index.js'
import { mergeIntoEnums } from '../src/lang/enums.js'
import { chanceFrom, drawU32 } from '../src/lang/draws.js'
import { ProgramState } from '../../demo/shaders/lib/program-state.js'

const renderer = new CanvasRenderer()
for (const [namespace, name, path] of [['synth', 'Noise', 'synth/noise'], ['filter', 'Edge', 'filter/edge'], ['filter', 'Posterize', 'filter/posterize']]) {
    const instance = (await import(`../effects/${path}/definition.js`)).default
    const choices = renderer.registerEffectWithRuntime({ namespace, name, instance })
    if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices)
}
registerStarterOps(['synth.noise'])

// ProgramState with a host that holds the DSL and has no running pipeline.
function stateFor(dsl) {
    const host = { currentDsl: dsl, pipeline: null, enums: {} }
    const state = new ProgramState({ renderer: host })
    state.fromDsl(dsl)
    const events = []
    state.on('seedchange', e => events.push(['seedchange', e]))
    state.on('recompileNeeded', e => events.push(['recompileNeeded', e]))
    return { host, state, events }
}
const value = (state, param, step = 'step_0') => state.getValue(step, param)

test('getSeed reads the seed directive', () => {
    assert.equal(stateFor('search synth\nnoise().write(o0)').state.getSeed(), null)
    assert.equal(stateFor('search synth\nseed 7\nnoise().write(o0)').state.getSeed(), 7)
})

test('setSeed writes the directive and updates the drawn values without a recompile', () => {
    const { host, state, events } = stateFor('search synth\nseed 7\nnoise(scaleY: rand(1, 10)).write(o0)')
    const before = value(state, 'scaleY')
    const dsl = state.setSeed(8)
    assert.match(dsl, /^search synth\nseed 8\n/)
    assert.equal(host.currentDsl, dsl)
    assert.equal(state.getSeed(), 8)
    assert.notEqual(value(state, 'scaleY'), before)
    assert.equal(value(state, 'scaleY'), compile(dsl).plans[0].chain[0].args.scaleY)
    assert.match(dsl, /scaleY: rand\(1, 10\)/)
    assert.deepEqual(events.map(e => e[0]), ['seedchange'])
    assert.equal(events[0][1].recompile, false)
})

test('setSeed adds a directive to a program without one', () => {
    const { state } = stateFor('search synth\nnoise(scaleY: rand(1, 10)).write(o0)')
    assert.match(state.setSeed(5), /^search synth\nseed 5\n/)
    assert.throws(() => state.setSeed(-1), RangeError)
})

test('a seed change that changes structure asks for a recompile', () => {
    const dsl = 'search synth, filter\nseed 0\nnoise()\nmaybe(0.5) {\n    .posterize()\n}\n.write(o0)'
    const taken = s => chanceFrom(drawU32(s, 'maybe_1/decide'), 0.5)
    let other = 1
    while (taken(other) === taken(0)) other++
    const { state, events } = stateFor(dsl)
    state.setSeed(other)
    assert.ok(events.some(e => e[0] === 'recompileNeeded'))
    assert.equal(events.find(e => e[0] === 'seedchange')[1].recompile, true)
})

test('reseed sets a fresh whole-number seed', () => {
    const { state } = stateFor('search synth\nnoise().write(o0)')
    const seed = state.reseed()
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 4294967295)
    assert.equal(state.getSeed(), seed)
})

test('getBinding names random and inherited parameters', () => {
    const { state } = stateFor('search synth\nseed 1\nlet s = rand(1, 10)\nnoise(scaleY: rand(1, 10), scaleX: s, octaves: 3).write(o0)')
    assert.equal(state.getBinding('step_0', 'scaleY').kind, 'random')
    assert.deepEqual(state.getBinding('step_0', 'scaleX'), { kind: 'random', let: 's' })
    assert.equal(state.getBinding('step_0', 'seed').kind, 'inherited-seed')
    assert.equal(state.getBinding('step_0', 'octaves'), null)
})

test('a pinned value stays through reseeds, and unpinning lets it draw again', () => {
    const { state } = stateFor('search synth\nseed 7\nnoise(scaleY: rand(1, 10)).write(o0)')
    const pinnedValue = value(state, 'scaleY')
    assert.match(state.pin('step_0', 'scaleY'), /rand\(1, 10, seed: \d+\)/)
    state.setSeed(123)
    assert.equal(value(state, 'scaleY'), pinnedValue)
    assert.doesNotMatch(state.unpin('step_0', 'scaleY'), /seed: \d+\)/)
    assert.notEqual(value(state, 'scaleY'), pinnedValue)
})

test('pinning a parameter bound to a let pins the let, and every parameter it drives', () => {
    const { state } = stateFor('search synth\nseed 7\nlet s = rand(2, 10)\nnoise(scaleX: s, scaleY: s).write(o0)')
    const before = value(state, 'scaleY')
    assert.match(state.pin('step_0', 'scaleX'), /let s = rand\(2, 10, seed: \d+\)/)
    state.setSeed(99)
    assert.equal(value(state, 'scaleX'), before)
    assert.equal(value(state, 'scaleY'), before)
})

test('unpin keeps the calls another pinned parameter shares', () => {
    const { state } = stateFor('search synth\nseed 7\nlet s = rand(2, 10)\nnoise(scaleX: s, scaleY: s).write(o0)')
    state.pin('step_0', 'scaleX')
    assert.match(state.unpin('step_0', 'scaleX', [['step_0', 'scaleY']]), /seed: \d+/)
})

test('pinning an inherited seed makes it the effect’s own seed', () => {
    const { state } = stateFor('search synth\nseed 7\nnoise().write(o0)')
    const inherited = value(state, 'seed')
    assert.match(state.pin('step_0', 'seed'), new RegExp(`seed: ${inherited}`))
    state.setSeed(1000)
    assert.equal(value(state, 'seed'), inherited)
    assert.equal(state.getBinding('step_0', 'seed'), null)
})

test('a pin in a part used more than once is refused', () => {
    const dsl = 'search synth, filter\nseed 7\npart e {\n    .edge(amount: rand(1, 3))\n}\nnoise().use(e).use(e).write(o0)'
    const { state } = stateFor(dsl)
    assert.throws(() => state.pin('step_1', 'amount'), /used more than once/)
    assert.throws(() => state.pin('step_0', 'octaves'), /not randomized/)
})

test('edits through ProgramState keep random calls, and an edited value replaces its call', () => {
    const { host, state } = stateFor('search synth\nseed 7\nnoise(scaleY: rand(1, 10), octaves: 2).write(o0)')
    state.setValue('step_0', 'octaves', 3)
    const kept = state.toDsl()
    assert.match(kept, /scaleY: rand\(1, 10\)/)
    assert.match(kept, /octaves: 3/)
    state.setValue('step_0', 'scaleY', 5)
    assert.match(state.toDsl(), /scaleY: 5/)
    host.currentDsl = 'search synth\nseed 7\nnoise().write(o0)'
    state.fromDsl(host.currentDsl)
    state.setValue('step_0', 'seed', 42)
    assert.match(state.toDsl(), /seed: 42/)
})

test('_seed survives a ProgramState round trip', () => {
    const { state } = stateFor('search synth\nnoise(_seed: 5, scaleY: rand(1, 10)).write(o0)')
    assert.match(state.toDsl(), /_seed: 5/)
})

test('the renderer reads and sets the seed for hosts without ProgramState', async () => {
    const host = new CanvasRenderer()
    host.currentDsl = 'search synth\nseed 3\nnoise(scaleY: rand(1, 10)).write(o0)'
    assert.equal(host.getSeed(), 3)
    let compiled = null
    host.compile = async dsl => { compiled = dsl; host.currentDsl = dsl; return null }
    await host.setSeed(11)
    assert.match(compiled, /^search synth\nseed 11\n/)
    assert.match(compiled, /scaleY: rand\(1, 10\)/)
    assert.equal(host.getSeed(), 11)
})

test('a pin in a part used once is written into the part', () => {
    const { state } = stateFor('search synth, filter\nseed 7\npart e {\n    .edge(amount: rand(1, 3))\n}\nnoise().use(e).write(o0)')
    const before = value(state, 'amount', 'step_1')
    assert.match(state.pin('step_1', 'amount'), /\.edge\(amount: rand\(1, 3, seed: \d+\)\)/)
    state.setSeed(500)
    assert.equal(value(state, 'amount', 'step_1'), before)
})
